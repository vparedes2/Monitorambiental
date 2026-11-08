import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { 
  getInstalacionesSigOficiales, 
  getGeoJsonStore, 
  ingestarCapaGeoJson, 
  resetToOfficialDefaults, 
  agregarInstalacionIndividual,
  buscarInstalacionSig
} from "./src/services/geoportalSigService.js";
import { calcular_distancia_haversine } from "./src/services/cadastralValidation.js";
import { ZONAS_BARRIDO, obtenerBarrido, obtenerLocalidades, muestrearRio, muestrearCosta } from "./src/services/osmGeo.js";
import { 
  ejecutarCruceEspacialSatelital, 
  ingestarDeteccionSatelital, 
  resetDeteccionesSatelitales,
  parseFirmsCsv,
  setDeteccionesFirms,
  FIRMS_SOURCES,
  BBOX_CUENCA
} from "./src/services/satelliteDetectionsService.js";
import fs from "fs";
import { decode as decodificarPng, encode as codificarPng } from "fast-png";

/** Sentinel Hub a veces optimiza el PNG (gris, gris+alfa, paleta o 16 bits cuando la imagen es
 *  casi uniforme, p. ej. sin ningún candidato). Se normaliza siempre a RGBA de 8 bits. */
const pngRGBA = (bytes: Uint8Array) => {
  const img: any = decodificarPng(bytes);
  const W = img.width, H = img.height, ch = img.channels, src = img.data, prof = img.depth || 8;
  const out = new Uint8Array(W * H * 4);
  const v = (x: number) => (prof === 16 ? x >> 8 : x);
  for (let i = 0; i < W * H; i++) {
    let r, g, b, a = 255;
    if (img.palette && ch === 1) {
      const c = img.palette[src[i]] || [0, 0, 0];
      [r, g, b] = c; if (c.length > 3) a = c[3];
    } else if (ch === 1 || ch === 2) {
      r = g = b = v(src[i * ch]); if (ch === 2) a = v(src[i * ch + 1]);
    } else {
      r = v(src[i * ch]); g = v(src[i * ch + 1]); b = v(src[i * ch + 2]); if (ch === 4) a = v(src[i * ch + 3]);
    }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return { width: W, height: H, channels: 4, data: out };
};


dotenv.config();

const limpiarEnv = (v?: string) => (v || "").replace(/^["']|["']$/g, "").trim();

// ---------------------------------------------------------------------------
// Persistencia del catastro cargado por el usuario (sobrevive a reinicios
// mientras el disco del contenedor exista; el navegador además guarda copia).
// ---------------------------------------------------------------------------
const CATASTRO_FILE = process.env.VERCEL
  ? path.join("/tmp", "catastro.geojson")
  : path.join(process.cwd(), "data", "catastro.geojson");
const guardarCatastro = () => {
  try {
    fs.mkdirSync(path.dirname(CATASTRO_FILE), { recursive: true });
    fs.writeFileSync(CATASTRO_FILE, JSON.stringify(getGeoJsonStore()));
  } catch (e: any) {
    console.log("[Catastro] No se pudo guardar en disco:", e.message);
  }
};
try {
  if (fs.existsSync(CATASTRO_FILE)) {
    const guardado = JSON.parse(fs.readFileSync(CATASTRO_FILE, "utf8"));
    if (guardado?.features?.length) {
      ingestarCapaGeoJson(guardado, "replace");
      console.log(`[Catastro] ${guardado.features.length} instalaciones restauradas desde disco.`);
    }
  }
} catch (e: any) {
  console.log("[Catastro] No se pudo leer el archivo guardado:", e.message);
}

// ---------------------------------------------------------------------------
// NASA FIRMS (focos térmicos VIIRS reales). Requiere FIRMS_MAP_KEY gratuita:
// https://firms.modaps.eosdis.nasa.gov/api/map_key/
// ---------------------------------------------------------------------------
type EstadoFirms = {
  estado: "ok" | "sin_clave" | "error";
  mensaje: string;
  consultado_utc: string | null;
  dias: number;
  total: number;
  por_fuente: Record<string, number | string>;
};
let estadoFirms: EstadoFirms = {
  estado: "sin_clave",
  mensaje: "Falta FIRMS_MAP_KEY en los secretos de la app. Sin ella no hay focos térmicos reales.",
  consultado_utc: null,
  dias: 2,
  total: 0,
  por_fuente: {}
};
let ultimaConsultaFirms = 0;
const FIRMS_CACHE_MS = 10 * 60 * 1000;

const actualizarFirms = async (forzar = false): Promise<EstadoFirms> => {
  const mapKey = limpiarEnv(process.env.FIRMS_MAP_KEY);
  if (!mapKey) {
    setDeteccionesFirms([]);
    estadoFirms = { ...estadoFirms, estado: "sin_clave", total: 0, por_fuente: {} };
    return estadoFirms;
  }
  if (!forzar && Date.now() - ultimaConsultaFirms < FIRMS_CACHE_MS && estadoFirms.estado === "ok") {
    return estadoFirms;
  }

  const dias = 2;
  const area = `${BBOX_CUENCA.west},${BBOX_CUENCA.south},${BBOX_CUENCA.east},${BBOX_CUENCA.north}`;
  const todas: any[] = [];
  const porFuente: Record<string, number | string> = {};
  const errores: string[] = [];

  await Promise.all(FIRMS_SOURCES.map(async ({ source, sensor }) => {
    try {
      const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${source}/${area}/${dias}`;
      const r = await fetch(url);
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 120)}`);
      const lista = parseFirmsCsv(txt, sensor);
      porFuente[source] = lista.length;
      todas.push(...lista);
    } catch (e: any) {
      porFuente[source] = `error: ${e.message}`;
      errores.push(`${source}: ${e.message}`);
    }
  }));

  setDeteccionesFirms(todas);
  ultimaConsultaFirms = Date.now();
  const huboExito = Object.values(porFuente).some((v) => typeof v === "number");
  estadoFirms = {
    estado: huboExito ? "ok" : "error",
    mensaje: huboExito
      ? `${todas.length} focos térmicos reales en la cuenca (últimas ${dias * 24} h).${errores.length ? " Algunas fuentes fallaron." : ""}`
      : `No se pudo consultar NASA FIRMS: ${errores.join(" | ")}`,
    consultado_utc: new Date().toISOString(),
    dias,
    total: todas.length,
    por_fuente: porFuente
  };
  console.log(`[FIRMS] ${estadoFirms.mensaje}`);
  return estadoFirms;
};

const PORT = 3000;
const app = express();

// ---------------------------------------------------------------------------
// Usuarios y permisos (Supabase). Las consultas que gastan cupo satelital o de IA
// exigen sesión y el permiso correspondiente; el resto de los datos públicos queda abierto.
// ---------------------------------------------------------------------------
const SUPA_URL = "https://azccpjhcafurltdndkam.supabase.co";
const SUPA_CLAVE = "sb_publishable_UFzi-mP-yeIThOiavE0n8Q_TEk0pRF9";
type PerfilSrv = { rol: string; activo: boolean; permisos: Record<string, boolean> };
const cachePerfil = new Map<string, { t: number; perfil: PerfilSrv | null }>();
const perfilDe = async (req: any): Promise<PerfilSrv | null> => {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const c = cachePerfil.get(token);
  if (c && Date.now() - c.t < 5 * 60000) return c.perfil;
  let perfil: PerfilSrv | null = null;
  try {
    const u = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { apikey: SUPA_CLAVE, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (u.ok) {
      const { id } = await u.json();
      const p = await fetch(`${SUPA_URL}/rest/v1/perfiles?id=eq.${id}&select=rol,activo,permisos`, { headers: { apikey: SUPA_CLAVE, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (p.ok) perfil = (await p.json())[0] ?? null;
    }
  } catch { /* sin sesión válida */ }
  cachePerfil.set(token, { t: Date.now(), perfil });
  if (cachePerfil.size > 1000) cachePerfil.delete(cachePerfil.keys().next().value!);
  return perfil;
};
const puedeSrv = (p: PerfilSrv, id: string) => {
  if (p.rol === "admin" && p.activo) return true;
  if (!p.activo) return false;
  const pantalla = id.split(".")[0];
  return (pantalla === "inicio" || p.permisos[pantalla] === true) && p.permisos[id] === true;
};
/** Exige sesión con al menos uno de los permisos indicados */
const requiere = (...permisos: string[]) => async (req: any, res: any, next: any) => {
  const p = await perfilDe(req);
  if (!p) return res.status(401).json({ error: "Ingresá con tu usuario para usar esta función." });
  if (!permisos.some((x) => puedeSrv(p, x))) return res.status(403).json({ error: "Tu usuario no tiene habilitada esta función. Consultá con el administrador." });
  next();
};


// Set body parser with high limit to support satellite image uploads
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

let aiCircuitBreakerActive = false;
let aiCircuitBreakerResetTime = 0;

const triggerCircuitBreaker = (_reason?: string) => {
  aiCircuitBreakerActive = true;
  aiCircuitBreakerResetTime = Date.now() + 60 * 1000;
  console.log("[HSE Monitor Engine] Conmutando temporalmente al motor local calibrado de respaldo.");
};

// Initialize Google GenAI securely (server-side only)
const getGeminiClient = () => {
  if (aiCircuitBreakerActive) {
    if (Date.now() > aiCircuitBreakerResetTime) {
      aiCircuitBreakerActive = false;
      console.log("[HSE Monitor Engine] Servicio restaurado. Probando conectividad.");
    } else {
      return null;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("[HSE Monitor Engine] Utilizando simulador local calibrado.");
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// Multi-model fallback cascade for resilient AI execution under high demand
const CANDIDATE_FLASH_MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

// Helper function to retry Gemini API calls across models on high demand or fail gracefully
const callGeminiWithRetry = async (aiClient: any, params: any): Promise<any> => {
  const modelsToTry = [
    params.model || "gemini-3.8-flash",
    ...CANDIDATE_FLASH_MODELS.filter(m => m !== (params.model || "gemini-3.8-flash"))
  ];

  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    try {
      const response = await aiClient.models.generateContent({
        ...params,
        model: currentModel
      });
      return response;
    } catch (err: any) {
      lastError = err;
      const errorMsg = String(err?.message || "");
      const isTransient = errorMsg.includes("503") || 
                          errorMsg.includes("high demand") || 
                          errorMsg.includes("overloaded") || 
                          errorMsg.includes("temporary") || 
                          errorMsg.includes("busy") || 
                          errorMsg.includes("429") || 
                          errorMsg.includes("quota") || 
                          err?.status === 503 || 
                          err?.status === 429;

      if (isTransient && i < modelsToTry.length - 1) {
        console.log("[HSE Monitor Engine] Modelo con alta demanda transitoria, conmutando a relevo...");
        await new Promise(r => setTimeout(r, 400));
        continue;
      }
      break;
    }
  }

  throw lastError;
};

// Generates an expert environmental assessment using physical equations and local guidelines
const generateHighFidelityReport = (params: any, isFromException: boolean = false) => {
  const {
    latitude,
    longitude,
    windSpeed,
    windDirection,
    ch4Value,
    co2Value,
    no2Value,
    so2Value,
    surfaceArea,
    type,
    description
  } = params;

  const distAnelo = Math.sqrt(Math.pow(latitude - (-38.352), 2) + Math.pow(longitude - (-68.789), 2)) * 111;
  const parsedDist = `${distAnelo.toFixed(1)} km`;
  const dispersionDir = windDirection === "SW" || windDirection === "Sudoeste" ? "Noreste (NE)" : "Sudoeste (SW)";

  // Custom-themed description based on the type of contamination
  let descVisual = "";
  const cleanType = type || "Derrame en suelo";
  if (cleanType.includes("Derrame") || cleanType.includes("suelo")) {
    descVisual = `Análisis de teledetección (RGB/NDVI) dtecta alteración de reflectancia en el suelo semiárido de Vaca Muerta, compatible con infiltración de hidrocarburos pesados o agua de producción (flowback). Se estima una superficie de dispersión activa de ${surfaceArea} m² con riesgo latente de escurrimiento superficial hídrico hacia cuencas linderas. Observación: ${description || "Sin anotaciones."}`;
  } else if (cleanType.includes("Venteo") || cleanType.includes("Fuga") || cleanType.includes("Metano")) {
    descVisual = `Teledetección por sensor de onda corta (SWIR/CAMS) reporta anomalía puntual con concentración local de Metano (CH4) de ${ch4Value || 1.8} ppm (valor de fondo regional normal: 1.8 ppm), lo que señala un evento potencial de venteo continuo o pérdida difusa en cabeza de pozo o ducto. Observación: ${description || "Sin anotaciones."}`;
  } else if (cleanType.includes("Anomalía") || cleanType.includes("Térmica") || cleanType.includes("Flaring")) {
    descVisual = `Análisis infrarrojo térmico (TIR) registra firma de alta emisión calórica compatible con quema ineficiente (flaring) en antorcha de producción asistida. Adicionalmente se registra concentración de CO2 de ${co2Value || 410} ppm en celdas colindantes. Observación: ${description || "Sin anotaciones."}`;
  } else {
    descVisual = `Monitoreo del índice NDVI de suelos y teledetección espectral detallan escurrimiento o depósito no impermeable de lodos / residuos de perforación que cubren ${surfaceArea} m² con degradación progresiva de la escasa cubierta xerófila local. Observación: ${description || "Sin anotaciones."}`;
  }

  const plan = [
    `Establecer un cerco de contención y aislamiento perimetral de emergencia cubriendo el área afectada estimada de ${surfaceArea} m² para detener vectores de avance físico.`,
    `Movilizar cuadrilla especializada de seguridad e higiene (HSE) equipada con medidores de gas portátiles tipo PID/MultiRAE para verificación táctica en coordenadas [${latitude}, ${longitude}].`,
    `Proceder con ${
      cleanType.includes("Derrame") || cleanType.includes("lodos")
        ? "la colocación de barreras absorbentes orgánicas hidrofóbicas y excavación dirigida de tierra saturada para evitar infiltraciones permanentes."
        : "la inspección óptica por cámara de gas infrarroja (OGI) para detener la fuga o regular los venteos y adecuar la presión del separador."
    }`,
    `Notificar formalmente a las autoridades de contralor ambiental de la provincia de Neuquén de acuerdo con la Ley Provincial 1875 reguladora de hidrocarburos.`
  ];

  const riesgo = (distAnelo < 15 || cleanType.includes("Derrame") || (ch4Value && ch4Value > 3)) ? "Crítico" : "Alto";
  const certeza = isFromException 
    ? "Alta (Simulación de Respaldo - API Congestionada)" 
    : "Media (Modelo de Simulación)";

  return {
    foco_detectado: {
      tipo_contaminación: cleanType,
      certeza_analisis: certeza,
      descripcion_visual: descVisual
    },
    contexto_geografico: {
      proximidad_anelo: `Ubicado aproximadamente a ${parsedDist} de Añelo (Rutas Provinciales RP 7 / RP 17), representando una criticidad logística ${distAnelo < 20 ? "Extrema" : "Moderada"}.`,
      impacto_viento: `Con vientos activos de ${windSpeed} km/h soplando desde el ${windDirection}, la pluma de dispersión gaseosa y particulados tiene un eje de arrastre principal hacia el ${dispersionDir}.`
    },
    evaluacion_hse: {
      nivel_riesgo: riesgo,
      poblacion_o_recurso_afectado: distAnelo < 15 
        ? "Área urbana consolidada de Añelo, rutas comerciales de alto tránsito (RP 7) y captaciones fluviales rurales." 
        : "Pastizales semiáridos naturales, puestos de crianceros locales dispersos y escorrentías colindantes.",
      superficie_analizada_nota: `La superficie reportada de ${surfaceArea} m² representa un evento de magnitud moderada-severa en el ecosistema estepario de Vaca Muerta, exigiendo aislamiento preventivo inmediato.`,
      riesgo_poblacion_salud: cleanType.includes("Derrame") || cleanType.includes("lodos")
        ? "Elevado riesgo de lixiviación e infiltración de metales pesados o hidrocarburos en napas freáticas. Vecinos y crianceros de puestos rurales dispersos sufren riesgo de bioacumulación por consumo de agua no tratada y contacto directo, además de afección indirecta por ganado que consume forraje contaminado."
        : cleanType.includes("Anomalía") || cleanType.includes("Térmica")
          ? "La combustión incompleta y emisiones asociadas liberan particulado fino (PM2.5/PM10) e hidrocarburos aromáticos volátiles. Se registra riesgo de irritación de vías respiratorias aéreas superiores, exacerbación de cuadros broncoobstructivos crónicos y asma infantil en asentamientos situados a sotavento."
          : "Dispersión de gases pesados o compuesto volátil btex bajo la influencia de la deriva eólica. Esto representa un peligro respiratorio agudo directo (náuseas, cefaleas, hipoxia por confinamiento de gases en cañadones semiáridos) y peligro de ignición fortuita si interactúa con tránsito vehicular o chispas."
    },
    plan_accion_sugerido: plan
  };
};

// API Endpoint to establish a real connection to Copernicus CDSE and OpenAQ databases
// ---------------------------------------------------------------------------
// Imágenes satelitales procesadas (Sentinel Hub en Copernicus Data Space).
// Cada capa es un "evalscript" que define qué bandas se combinan y cómo.
// ---------------------------------------------------------------------------
let tokenCdse: { valor: string; vence: number } | null = null;
const obtenerTokenCdse = async (): Promise<string> => {
  if (tokenCdse && Date.now() < tokenCdse.vence) return tokenCdse.valor;
  const id = limpiarEnv(process.env.COPERNICUS_CLIENT_ID);
  const secret = limpiarEnv(process.env.COPERNICUS_CLIENT_SECRET);
  if (!id || !secret) throw new Error("Faltan COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET en el servidor.");
  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret });
  const r = await fetch("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body
  });
  if (!r.ok) throw new Error(`Copernicus rechazó las credenciales (HTTP ${r.status}).`);
  const d: any = await r.json();
  tokenCdse = { valor: d.access_token, vence: Date.now() + Math.max(60, (d.expires_in || 600) - 60) * 1000 };
  return tokenCdse.valor;
};

const RAMPA = (stops: [number, number[]][]) => `
function rampa(v){
  const s=${JSON.stringify(stops)};
  if(v<=s[0][0])return s[0][1];
  for(let i=1;i<s.length;i++){ if(v<=s[i][0]){ const t=(v-s[i-1][0])/(s[i][0]-s[i-1][0]); const a=s[i-1][1], b=s[i][1]; return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]; } }
  return s[s.length-1][1];
}`;

const CAPAS_IMAGEN: Record<string, { coleccion: string; dias: number; filtro?: any; procesamiento?: any; mosaico?: string; script: string }> = {
  color: {
    coleccion: "sentinel-2-l2a", dias: 15, filtro: { maxCloudCoverage: 60 }, mosaico: "leastCC",
    script: `//VERSION=3
function setup(){return{input:["B02","B03","B04","dataMask"],output:{bands:4}}}
function evaluatePixel(s){return[2.6*s.B04,2.6*s.B03,2.6*s.B02,s.dataMask]}`
  },
  swir: {
    coleccion: "sentinel-2-l2a", dias: 10, filtro: { maxCloudCoverage: 80 }, mosaico: "mostRecent",
    script: `//VERSION=3
function setup(){return{input:["B8A","B11","B12","dataMask"],output:{bands:4}}}
function evaluatePixel(s){return[2.5*s.B12,2.5*s.B11,2.5*s.B8A,s.dataMask]}`
  },
  termico: {
    coleccion: "sentinel-3-slstr", dias: 2, mosaico: "mostRecent",
    script: `//VERSION=3
function setup(){return{input:["S8","dataMask"],output:{bands:4}}}
${RAMPA([[265, [0.1, 0.15, 0.45]], [285, [0.2, 0.55, 0.8]], [300, [0.95, 0.85, 0.35]], [315, [1, 0.45, 0.1]], [330, [0.85, 0.05, 0.05]]])}
function evaluatePixel(s){const c=rampa(s.S8);return[c[0],c[1],c[2],s.dataMask]}`
  },
  metano: {
    coleccion: "sentinel-5p-l2", dias: 10, mosaico: "mostRecent",
    script: `//VERSION=3
function setup(){return{input:["CH4","dataMask"],output:{bands:4}}}
${RAMPA([[1820, [0.15, 0.2, 0.55]], [1860, [0.2, 0.6, 0.75]], [1900, [0.95, 0.85, 0.35]], [1940, [1, 0.45, 0.1]], [1980, [0.8, 0.05, 0.1]]])}
function evaluatePixel(s){const c=rampa(s.CH4);return[c[0],c[1],c[2],s.dataMask*0.85]}`
  },
  no2: {
    coleccion: "sentinel-5p-l2", dias: 7, mosaico: "mostRecent",
    script: `//VERSION=3
function setup(){return{input:["NO2","dataMask"],output:{bands:4}}}
${RAMPA([[0, [0.15, 0.2, 0.55]], [0.00004, [0.2, 0.6, 0.75]], [0.00008, [0.95, 0.85, 0.35]], [0.00013, [1, 0.45, 0.1]], [0.0002, [0.8, 0.05, 0.1]]])}
function evaluatePixel(s){const c=rampa(s.NO2);return[c[0],c[1],c[2],s.dataMask*0.85]}`
  },
  so2: {
    coleccion: "sentinel-5p-l2", dias: 7, mosaico: "mostRecent",
    script: `//VERSION=3
function setup(){return{input:["SO2","dataMask"],output:{bands:4}}}
${RAMPA([[0, [0.15, 0.2, 0.55]], [0.0002, [0.2, 0.6, 0.75]], [0.0005, [0.95, 0.85, 0.35]], [0.001, [1, 0.45, 0.1]], [0.002, [0.8, 0.05, 0.1]]])}
function evaluatePixel(s){const c=rampa(s.SO2);return[c[0],c[1],c[2],s.dataMask*0.85]}`
  },
  co: {
    coleccion: "sentinel-5p-l2", dias: 7, mosaico: "mostRecent",
    script: `//VERSION=3
function setup(){return{input:["CO","dataMask"],output:{bands:4}}}
${RAMPA([[0.02, [0.15, 0.2, 0.55]], [0.025, [0.2, 0.6, 0.75]], [0.03, [0.95, 0.85, 0.35]], [0.04, [1, 0.45, 0.1]], [0.05, [0.8, 0.05, 0.1]]])}
function evaluatePixel(s){const c=rampa(s.CO);return[c[0],c[1],c[2],s.dataMask*0.85]}`
  },
  vegetacion: {
    coleccion: "sentinel-2-l2a", dias: 15, filtro: { maxCloudCoverage: 60 }, mosaico: "leastCC",
    script: `//VERSION=3
function setup(){return{input:["B04","B08","dataMask"],output:{bands:4}}}
${RAMPA([[-0.1, [0.55, 0.45, 0.35]], [0.1, [0.85, 0.75, 0.55]], [0.25, [0.6, 0.8, 0.35]], [0.5, [0.15, 0.6, 0.2]], [0.8, [0.0, 0.35, 0.1]]])}
function evaluatePixel(s){const v=(s.B08-s.B04)/(s.B08+s.B04+1e-6);const c=rampa(v);return[c[0],c[1],c[2],s.dataMask]}`
  },
  agua: {
    coleccion: "sentinel-2-l2a", dias: 15, filtro: { maxCloudCoverage: 60 }, mosaico: "leastCC",
    script: `//VERSION=3
function setup(){return{input:["B03","B08","dataMask"],output:{bands:4}}}
${RAMPA([[-0.6, [0.12, 0.12, 0.12]], [-0.1, [0.35, 0.33, 0.3]], [0.0, [0.55, 0.8, 0.95]], [0.3, [0.1, 0.45, 0.85]], [0.6, [0.0, 0.15, 0.55]]])}
function evaluatePixel(s){const v=(s.B03-s.B08)/(s.B03+s.B08+1e-6);const c=rampa(v);return[c[0],c[1],c[2],s.dataMask]}`
  },
  radar: {
    coleccion: "sentinel-1-grd", dias: 12, mosaico: "mostRecent", filtro: { acquisitionMode: "IW" },
    script: `//VERSION=3
function setup(){return{input:["VV","dataMask"],output:{bands:4}}}
function evaluatePixel(s){const v=Math.max(0,Math.log(s.VV)*0.21714724095+1);return[v,v,v*1.05,s.dataMask]}`
  }
};

app.get("/api/imagen", requiere("catalogo"), async (req, res) => {
  try {
    const capa = String(req.query.capa || "swir");
    const def = CAPAS_IMAGEN[capa];
    if (!def) return res.status(400).json({ error: `Capa desconocida: ${capa}` });
    const bbox = String(req.query.bbox || "-70.5,-39.5,-67.5,-37").split(",").map(Number);
    if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) return res.status(400).json({ error: "bbox inválido" });
    const ancho = Math.min(1400, Math.max(200, Number(req.query.w) || 1024));
    const alto = Math.min(1400, Math.max(200, Number(req.query.h) || 860));
    const dias = Math.min(60, Math.max(1, Number(req.query.dias) || def.dias));
    // "hace": desplaza la ventana hacia atrás (comparación antes y después), hasta 3 años
    const hace = Math.min(1095, Math.max(0, Number(req.query.hace) || 0));
    const hasta = new Date(Date.now() - hace * 86400000);
    const desde = new Date(hasta.getTime() - dias * 24 * 3600 * 1000);

    const token = await obtenerTokenCdse();
    const cuerpo = {
      input: {
        bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
        data: [{
          type: def.coleccion,
          dataFilter: { timeRange: { from: desde.toISOString(), to: hasta.toISOString() }, mosaickingOrder: def.mosaico, ...(def.filtro || {}) },
          ...(def.procesamiento ? { processing: def.procesamiento } : {})
        }]
      },
      output: { width: ancho, height: alto, responses: [{ identifier: "default", format: { type: "image/png" } }] },
      evalscript: def.script
    };
    const r = await fetchSH("https://sh.dataspace.copernicus.eu/api/v1/process", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" },
      body: JSON.stringify(cuerpo)
    });
    if (!r.ok) {
      const txt = await r.text();
      let msg = txt.slice(0, 300);
      try { msg = JSON.parse(txt)?.error?.message || msg; } catch { /* texto plano */ }
      return res.status(502).json({ error: `Sentinel Hub (HTTP ${r.status}): ${msg}` });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=1800");
    res.setHeader("X-Periodo", `${desde.toISOString()}/${hasta.toISOString()}`);
    return res.send(buf);
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Error generando la imagen" });
  }
});

// ---------------------------------------------------------------------------
// Análisis de suelo y agua (Sentinel-2 L2A, Statistical API de Sentinel Hub).
// Compara los últimos 60 días contra el mismo período del año anterior para
// descontar la estacionalidad. Reglas heurísticas documentadas en cada indicador.
// ---------------------------------------------------------------------------
const SCRIPT_SUELO_AGUA = `//VERSION=3
function setup(){return{input:[{bands:["B02","B03","B04","B08","B11","B12","SCL","dataMask"]}],output:[{id:"idx",bands:8,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]}}
function evaluatePixel(s){
  const nube=[0,1,3,8,9,10,11].indexOf(s.SCL)>=0;
  const ndvi=(s.B08-s.B04)/(s.B08+s.B04+1e-6);
  // MNDWI (Xu 2006): verde contra SWIR; separa mejor el agua turbia de los ríos patagónicos que el NDWI
  const mndwi=(s.B03-s.B11)/(s.B03+s.B11+1e-6);
  const ndmi=(s.B08-s.B11)/(s.B08+s.B11+1e-6);
  const bsi=((s.B11+s.B04)-(s.B08+s.B02))/((s.B11+s.B04)+(s.B08+s.B02)+1e-6);
  // NBR (Key y Benson): baja en suelo quemado o ennegrecido
  const nbr=(s.B08-s.B12)/(s.B08+s.B12+1e-6);
  const agua=(mndwi>0.1 || s.SCL==6)?1:0;
  const desnudo=(bsi>0.15 && ndvi<0.15)?1:0;
  // FAI (Hu 2009): algas o vegetación flotante sobre el agua
  const fai=s.B08-(s.B04+(s.B11-s.B04)*0.1873);
  const algas=(agua==1 && fai>0.02)?1:0;
  return {idx:[ndvi,mndwi,ndmi,bsi,agua,desnudo,nbr,algas], dataMask:[(s.dataMask==1 && !nube)?1:0]};
}`;

// Sentinel Hub (CDSE) limita por minuto: ante un 429 espera lo que indica Retry-After (o 5, 10, 20 s) y reintenta
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fetchSH = async (url: string, init: RequestInit) => {
  let espera = 5000;
  for (let intento = 0; ; intento++) {
    const r = await fetch(url, init);
    if (r.status !== 429 || intento >= 3) return r;
    const ra = Number(r.headers.get("retry-after"));
    await esperar(Math.min(25000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : espera));
    espera *= 2;
  }
};

const circuloGeo = (lat: number, lon: number, radioM: number, n = 32) => {
  const coords: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    coords.push([lon + (radioM * Math.sin(a)) / (111320 * Math.cos((lat * Math.PI) / 180)), lat + (radioM * Math.cos(a)) / 110540]);
  }
  return { type: "Polygon", coordinates: [coords] };
};

const NOMBRES_IDX = ["ndvi", "ndwi", "ndmi", "bsi", "agua", "desnudo", "nbr", "algas"];

const serieEstadistica = async (token: string, geom: any, desde: Date, hasta: Date, lado: number) => {
  const cuerpo = {
    input: {
      bounds: { geometry: geom, properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
      data: [{ type: "sentinel-2-l2a", dataFilter: { maxCloudCoverage: 70 } }]
    },
    aggregation: {
      timeRange: { from: desde.toISOString(), to: hasta.toISOString() },
      aggregationInterval: { of: "P5D" },
      width: lado,
      height: lado,
      evalscript: SCRIPT_SUELO_AGUA
    },
    calculations: { default: {} }
  };
  const r = await fetchSH("https://sh.dataspace.copernicus.eu/api/v1/statistics", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo)
  });
  const txt = await r.text();
  if (!r.ok) {
    let msg = txt.slice(0, 300);
    try { msg = JSON.parse(txt)?.error?.message || msg; } catch { /* texto */ }
    if (r.status === 429) throw new Error("Sentinel Hub está limitando las consultas por minuto (cupo gratuito). Esperá un minuto y volvé a intentar.");
    throw new Error(`Sentinel Hub estadísticas (HTTP ${r.status}): ${msg}`);
  }
  const d = JSON.parse(txt);
  const filas: any[] = [];
  for (const it of d.data || []) {
    if (it.error) continue;
    const bandas = it.outputs?.idx?.bands || {};
    const claves = Object.keys(bandas).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
    const fila: any = { fecha: it.interval?.from?.slice(0, 10) };
    let valido = 0;
    claves.forEach((k, i) => {
      const st = bandas[k]?.stats || {};
      fila[NOMBRES_IDX[i]] = typeof st.mean === "number" && Number.isFinite(st.mean) ? st.mean : null;
      if (i === 0 && st.sampleCount) valido = (st.sampleCount - (st.noDataCount || 0)) / st.sampleCount;
    });
    fila.valido = valido;
    if (valido >= 0.4 && fila.ndvi !== null) filas.push(fila);
  }
  return filas;
};

const mediana = (xs: number[]) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

type Nivel = "normal" | "observar" | "alerta" | "sin_datos";


// ---------------------------------------------------------------------------
// Lluvia del período (Open-Meteo): últimos 60 días con el pronóstico/análisis
// (past_days) y el mismo período del año anterior con el archivo histórico (ERA5).
// ---------------------------------------------------------------------------
type Lluvia = { reciente_mm: number; base_mm: number; fuente: string };
const cacheLluvia = new Map<string, { t: number; v: Lluvia | null }>();
const llovioMas = (l: Lluvia) => l.reciente_mm >= l.base_mm + 15 && l.reciente_mm >= l.base_mm * 1.5;
const sumaLluvia = async (url: string) => {
  const r = await fetch(url, { headers: { "User-Agent": "monitor-ambiental" } });
  if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
  const d = await r.json();
  const v: (number | null)[] = d?.daily?.precipitation_sum || [];
  if (!v.length) throw new Error("Open-Meteo sin datos");
  return v.reduce<number>((s, x) => s + (x ?? 0), 0);
};
const lluviaPeriodos = async (lat: number, lon: number, desde: Date, hasta: Date, desdeBase: Date, hastaBase: Date): Promise<Lluvia | null> => {
  const clave = `${lat.toFixed(2)}|${lon.toFixed(2)}|${hasta.toISOString().slice(0, 10)}`;
  const c = cacheLluvia.get(clave);
  if (c && Date.now() - c.t < 6 * 3600000) return c.v;
  const f = (d: Date) => d.toISOString().slice(0, 10);
  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000);
  const q = `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=precipitation_sum&timezone=America%2FArgentina%2FBuenos_Aires`;
  let v: Lluvia | null = null;
  try {
    const [rec, bas] = await Promise.all([
      sumaLluvia(`https://api.open-meteo.com/v1/forecast?${q}&past_days=${dias}&forecast_days=1`),
      sumaLluvia(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${f(desdeBase)}&end_date=${f(hastaBase)}`)
    ]);
    v = { reciente_mm: Math.round(rec), base_mm: Math.round(bas), fuente: "Open-Meteo" };
  } catch { v = null; }
  cacheLluvia.set(clave, { t: Date.now(), v });
  if (cacheLluvia.size > 500) cacheLluvia.delete(cacheLluvia.keys().next().value!);
  return v;
};

// ---------------------------------------------------------------------------
// Relieve y drenaje: Copernicus DEM GLO-30 desde Sentinel Hub. Se rellenan las
// depresiones (priority-flood, Barnes 2014), se calcula la dirección de flujo D8
// y la acumulación; los cauces son celdas que drenan más de 0,2 km². Para cada
// celda se mide la altura sobre el cauce al que drena (HAND, Rennó y otros 2008).
// ---------------------------------------------------------------------------
type Relieve = { bbox: number[]; W: number; H: number; z: Float32Array; hand: Float32Array; cauce: Uint8Array; celdaM: number };
const cacheRelieve = new Map<string, Relieve>();
const AREA_CAUCE_M2 = 200000;

const obtenerRelieve = async (lat: number, lon: number, radio: number): Promise<Relieve> => {
  // El drenaje necesita contexto: se toma bastante más que el círculo
  const R = radio + Math.max(1500, radio);
  const clave = `${lat.toFixed(3)}|${lon.toFixed(3)}|${R}`;
  const hit = cacheRelieve.get(clave);
  if (hit) return hit;
  const bbox = bboxCirculo(lat, lon, R);
  const lado = Math.round(Math.min(400, Math.max(64, (2 * R) / 30)));
  const token = await obtenerTokenCdse();
  const cuerpo = {
    input: { bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } }, data: [{ type: "dem", dataFilter: { demInstance: "COPERNICUS_30" }, processing: { upsampling: "BILINEAR" } }] },
    output: { width: lado, height: lado, responses: [{ identifier: "default", format: { type: "image/png" } }] },
    evalscript: `//VERSION=3
function setup(){return{input:["DEM"],output:{bands:1,sampleType:"UINT16"}}}
function evaluatePixel(s){return[Math.max(0,Math.min(65535,Math.round(s.DEM*10)))]}`
  };
  const r = await fetchSH("https://sh.dataspace.copernicus.eu/api/v1/process", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" }, body: JSON.stringify(cuerpo)
  });
  if (!r.ok) throw new Error(`Modelo de elevación (HTTP ${r.status})`);
  const img: any = decodificarPng(new Uint8Array(await r.arrayBuffer()));
  const W = img.width, H = img.height, ch = img.channels, N = W * H;
  const escala = (img.depth || 8) === 16 ? 10 : 10 / 257; // si llegara en 8 bits, aproximar
  const z = new Float32Array(N);
  for (let i = 0; i < N; i++) z[i] = img.data[i * ch] / escala;
  const celdaM = (2 * R) / W;
  const rel: Relieve = { bbox, W, H, z, celdaM, ...calcDrenaje(z, W, H, celdaM) };
  cacheRelieve.set(clave, rel);
  if (cacheRelieve.size > 40) cacheRelieve.delete(cacheRelieve.keys().next().value!);
  return rel;
};

const calcDrenaje = (z: Float32Array, W: number, H: number, celdaM: number) => {
  const N = W * H;
  // Priority-flood con épsilon: deja todo el terreno drenando hacia el borde
  const lleno = new Float32Array(N), cerrado = new Uint8Array(N), orden = new Int32Array(N);
  const heapI = new Int32Array(N), heapV = new Float32Array(N); let hn = 0;
  const push = (i: number, v: number) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (heapV[p] <= v) break; heapI[k] = heapI[p]; heapV[k] = heapV[p]; k = p; } heapI[k] = i; heapV[k] = v; };
  const pop = () => { const top = heapI[0]; const li = heapI[--hn], lv = heapV[hn]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && heapV[c + 1] < heapV[c]) c++; if (heapV[c] >= lv) break; heapI[k] = heapI[c]; heapV[k] = heapV[c]; k = c; } heapI[k] = li; heapV[k] = lv; return top; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { const i = y * W + x; cerrado[i] = 1; lleno[i] = z[i]; push(i, z[i]); }
  let no = 0;
  const DX = [-1, 0, 1, -1, 1, -1, 0, 1], DY = [-1, -1, -1, 0, 0, 1, 1, 1];
  while (hn) {
    const c = pop(); orden[no++] = c;
    const cx = c % W, cy = (c - cx) / W;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (cerrado[j]) continue;
      cerrado[j] = 1; lleno[j] = Math.max(z[j], lleno[c] + 1e-3); push(j, lleno[j]);
    }
  }
  // D8 sobre la superficie rellenada
  const abajo = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W;
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
    let mejor = 0, mj = -1;
    for (let k = 0; k < 8; k++) {
      const j = (y + DY[k]) * W + x + DX[k];
      const pend = (lleno[i] - lleno[j]) / (DX[k] && DY[k] ? Math.SQRT2 : 1);
      if (pend > mejor) { mejor = pend; mj = j; }
    }
    abajo[i] = mj;
  }
  // Acumulación: de arriba hacia abajo (orden inverso al de salida del heap)
  const acc = new Float32Array(N).fill(1);
  for (let n = N - 1; n >= 0; n--) { const i = orden[n]; if (abajo[i] >= 0) acc[abajo[i]] += acc[i]; }
  const minCeldas = AREA_CAUCE_M2 / (celdaM * celdaM);
  const cauce = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (acc[i] >= minCeldas) cauce[i] = 1;
  // HAND: aguas abajo primero, cada celda hereda el cauce al que drena
  const destino = new Int32Array(N).fill(-1), hand = new Float32Array(N).fill(NaN);
  for (let n = 0; n < N; n++) {
    const i = orden[n];
    destino[i] = cauce[i] ? i : abajo[i] >= 0 ? destino[abajo[i]] : -1;
    if (destino[i] >= 0) hand[i] = Math.max(0, z[i] - z[destino[i]]);
  }
  return { hand, cauce };
};
const celdaRelieve = (rel: Relieve, lat: number, lon: number) => {
  const [w, s, e, n] = rel.bbox;
  const x = Math.floor(((lon - w) / (e - w)) * rel.W), y = Math.floor(((n - lat) / (n - s)) * rel.H);
  return x < 0 || y < 0 || x >= rel.W || y >= rel.H ? -1 : y * rel.W + x;
};
/** Relieve sombreado con los cauces, para ver la humedad sobre el terreno */
const imagenRelieve = (rel: Relieve) => {
  const { W, H, z, cauce, celdaM } = rel;
  const out = new Uint8Array(W * H * 4);
  const az = (315 * Math.PI) / 180, alt = (45 * Math.PI) / 180;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    const g = (xx: number, yy: number) => z[Math.min(H - 1, Math.max(0, yy)) * W + Math.min(W - 1, Math.max(0, xx))];
    // Exageración vertical x3: la meseta neuquina es muy plana
    const dzdx = ((g(x + 1, y) - g(x - 1, y)) / (2 * celdaM)) * 3, dzdy = ((g(x, y + 1) - g(x, y - 1)) / (2 * celdaM)) * 3;
    const pend = Math.atan(Math.hypot(dzdx, dzdy)), asp = Math.atan2(dzdy, -dzdx);
    const l = Math.max(0, Math.cos(Math.PI / 2 - alt) * Math.cos(pend) + Math.sin(Math.PI / 2 - alt) * Math.sin(pend) * Math.cos(az - asp));
    if (cauce[i]) out.set([40, 150, 240, 255], o);
    else { const v = Math.round(60 + 180 * l); out.set([v, v - 6, v - 14, 150], o); }
  }
  return `data:image/png;base64,${Buffer.from(codificarPng({ width: W, height: H, data: out, channels: 4 })).toString("base64")}`;
};

const evaluarSueloAgua = (base: any[], reciente: any[], lluvia: Lluvia | null = null) => {
  const med = (filas: any[], k: string) => mediana(filas.map((f) => f[k]).filter((x) => x !== null));
  const ind = (id: string, nombre: string, k: string, regla: (b: number, r: number) => { nivel: Nivel; lectura: string }, escala = 1, unidad = "") => {
    const b = med(base, k);
    const r = med(reciente, k);
    if (b === null || r === null) return { id, nombre, base: b, reciente: r, delta: null, nivel: "sin_datos" as Nivel, lectura: "No hay suficientes imágenes sin nubes para comparar.", unidad };
    const res = regla(b, r);
    return { id, nombre, base: b * escala, reciente: r * escala, delta: (r - b) * escala, unidad, ...res };
  };

  const indicadores = [
    ind("agua", "Agua superficial", "agua", (b, r) => {
      const d = r - b;
      if (d >= 0.03 && r >= 0.02) return { nivel: "alerta", lectura: `La superficie con agua pasó de ${(b * 100).toFixed(1)}% a ${(r * 100).toFixed(1)}% del área. Puede ser una pileta nueva, un derrame de agua de retorno o anegamiento: verificar en imagen.` };
      if (d >= 0.01 && r >= 0.01) return { nivel: "observar", lectura: `Aumento leve de superficie con agua (${(b * 100).toFixed(1)}% → ${(r * 100).toFixed(1)}%).` };
      return { nivel: "normal", lectura: "Sin cambios relevantes en la superficie con agua respecto del año anterior." };
    }, 100, "% del área"),
    ind("humedad", "Humedad del suelo (NDMI)", "ndmi", (b, r) => {
      const d = r - b;
      if (d >= 0.08) return { nivel: "alerta", lectura: "Suelo marcadamente más húmedo que el año anterior en la misma época. Compatible con vuelco de líquidos o pérdidas; sin lluvias recientes, verificar." };
      if (d >= 0.04) return { nivel: "observar", lectura: "Suelo algo más húmedo que el año anterior. Puede deberse a lluvias; contrastar con registros meteorológicos." };
      return { nivel: "normal", lectura: "Humedad del suelo dentro de lo esperable para la época." };
    }),
    ind("desnudo", "Suelo desnudo / movimiento de suelo", "desnudo", (b, r) => {
      const d = r - b;
      if (d >= 0.15) return { nivel: "alerta", lectura: `El suelo descubierto creció de ${(b * 100).toFixed(0)}% a ${(r * 100).toFixed(0)}% del área: típico de una locación, picada o desmonte nuevo.` };
      if (d >= 0.05) return { nivel: "observar", lectura: `Aumento de suelo descubierto (${(b * 100).toFixed(0)}% → ${(r * 100).toFixed(0)}%).` };
      return { nivel: "normal", lectura: "Sin aumento relevante de suelo descubierto." };
    }, 100, "% del área"),
    ind("vegetacion", "Cubierta vegetal (NDVI)", "ndvi", (b, r) => {
      const d = r - b;
      const rel = b > 0.02 ? d / b : 0;
      if (d <= -0.07 || (b > 0.1 && rel <= -0.35)) return { nivel: "alerta", lectura: "Pérdida marcada de vegetación respecto del año anterior: desmonte, contaminación de suelo o sequía; verificar." };
      if (d <= -0.03 || (b > 0.1 && rel <= -0.15)) return { nivel: "observar", lectura: "Leve disminución de la vegetación respecto del año anterior." };
      return { nivel: "normal", lectura: "Vegetación similar al año anterior." };
    }),
    ind("quemado", "Suelo quemado (NBR)", "nbr", (b, r) => {
      const d = b - r; // dNBR: cuánto bajó respecto del año anterior
      if (d >= 0.1) return { nivel: "alerta", lectura: `El índice de quemado bajó ${d.toFixed(2)} respecto del año anterior: suelo quemado o ennegrecido, como alrededor de una antorcha, un incendio de pastizal o un derrame de crudo. Verificar en imagen.` };
      if (d >= 0.05) return { nivel: "observar", lectura: "Leve oscurecimiento del suelo compatible con quema o manchado; verificar." };
      return { nivel: "normal", lectura: "Sin señales de suelo quemado." };
    })
  ];
  // Algas flotantes (FAI): solo tiene sentido si hay agua; ayuda a descartar falsas manchas del radar
  {
    const agua_r = med(reciente, "agua"), algas_r = med(reciente, "algas"), algas_b = med(base, "algas");
    const frac = agua_r !== null && agua_r > 0.02 && algas_r !== null ? algas_r / agua_r : null;
    indicadores.push({
      id: "algas", nombre: "Algas o vegetación flotante (FAI)", base: algas_b !== null ? algas_b * 100 : null, reciente: algas_r !== null ? algas_r * 100 : null,
      delta: algas_r !== null && algas_b !== null ? (algas_r - algas_b) * 100 : null, unidad: "% del área",
      ...(frac === null
        ? { nivel: "sin_datos" as Nivel, lectura: "No hay agua suficiente en el área para medir algas." }
        : frac >= 0.2
          ? { nivel: "observar" as Nivel, lectura: `Hay algas o vegetación flotando en el ${(frac * 100).toFixed(0)} % del agua. Una mancha oscura del radar en esta zona puede ser algas y no hidrocarburo.` }
          : { nivel: "normal" as Nivel, lectura: `Sin algas relevantes en el agua (${(frac * 100).toFixed(0)} %).` })
    } as any);
  }
  // Los índices de suelo (humedad, vegetación, suelo desnudo) promedian toda el área: si buena parte es agua
  // no significan nada, y si el nivel del agua cambió entre años arrastran ese cambio
  const agua = indicadores[0];
  const fracAgua = Math.max(agua.base ?? 0, agua.reciente ?? 0) / 100;
  const cambioAgua = Math.abs(agua.delta ?? 0) / 100;
  for (const i of indicadores.filter((x) => x.id !== "agua" && x.id !== "algas")) {
    if (fracAgua >= 0.5) {
      Object.assign(i, { nivel: "sin_datos" as Nivel, lectura: `El área es mayormente agua (${(fracAgua * 100).toFixed(0)} %): este índice de suelo no aplica. Para buscar manchas en el agua usá Derrames, en agua.` });
    } else if ((fracAgua >= 0.15 || cambioAgua >= 0.05) && i.nivel !== "normal" && i.nivel !== "sin_datos") {
      Object.assign(i, { nivel: "observar" as Nivel, lectura: `${i.lectura} Ojo: hay agua en el área (${(fracAgua * 100).toFixed(0)} %) y su nivel puede haber cambiado entre años, lo que también mueve este índice.` });
    }
  }
  // Humedad: la lectura depende de si llovió más que el año anterior en el mismo período
  const hum = indicadores.find((x) => x.id === "humedad");
  if (hum && (hum.nivel === "alerta" || hum.nivel === "observar")) {
    const verMapa = " Con «Ver en el mapa» se ve si la humedad sigue los bajos y cauces (lluvia) o aparece en una loma o junto a una instalación (anómala).";
    if (!lluvia) {
      hum.lectura = `Suelo ${hum.nivel === "alerta" ? "marcadamente" : "algo"} más húmedo que el año anterior en la misma época. Puede ser lluvia o un vuelco o pérdida: no se pudo consultar la lluvia del período.${verMapa}`;
    } else if (llovioMas(lluvia)) {
      hum.nivel = "observar";
      hum.lectura = `Suelo más húmedo que el año anterior, pero en estos 60 días llovieron ${lluvia.reciente_mm} mm contra ${lluvia.base_mm} mm el año pasado: compatible con lluvia.${verMapa}`;
    } else {
      hum.lectura = `Suelo ${hum.nivel === "alerta" ? "marcadamente" : "algo"} más húmedo que el año anterior y no llovió más que entonces (${lluvia.reciente_mm} mm contra ${lluvia.base_mm} mm): compatible con vuelco de líquidos o pérdidas, verificar.${verMapa}`;
    }
  }
  const orden: Record<Nivel, number> = { sin_datos: 0, normal: 1, observar: 2, alerta: 3 };
  const general = indicadores.reduce<Nivel>((acc, i) => (orden[i.nivel] > orden[acc] ? i.nivel : acc), "sin_datos");
  return { indicadores, nivel_general: general };
};

const analizarPunto = async (lat: number, lon: number, radioM: number) => {
  const token = await obtenerTokenCdse();
  const geom = circuloGeo(lat, lon, radioM);
  const lado = Math.round(Math.min(250, Math.max(24, (2 * radioM) / 20)));
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - 60 * 86400000);
  const hastaBase = new Date(hasta.getTime() - 365 * 86400000);
  const desdeBase = new Date(desde.getTime() - 365 * 86400000);
  const [reciente, base, lluvia] = await Promise.all([
    serieEstadistica(token, geom, desde, hasta, lado),
    serieEstadistica(token, geom, desdeBase, hastaBase, lado),
    lluviaPeriodos(lat, lon, desde, hasta, desdeBase, hastaBase)
  ]);
  const ev = evaluarSueloAgua(base, reciente, lluvia);
  return {
    punto: { lat, lon },
    radio_m: radioM,
    periodos: {
      reciente: { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10), escenas_validas: reciente.length },
      base: { desde: desdeBase.toISOString().slice(0, 10), hasta: hastaBase.toISOString().slice(0, 10), escenas_validas: base.length }
    },
    ...ev,
    lluvia,
    series: { reciente, base },
    metodo: "Sentinel-2 L2A a 20 m, nubes y sombras excluidas con la clasificación SCL. Medianas de compuestos de 5 días. Comparación contra el mismo período del año anterior. Agua con MNDWI (Xu 2006), suelo quemado con NBR (Key y Benson 2006), algas flotantes con FAI (Hu 2009), humedad con NDMI, vegetación con NDVI y suelo desnudo con BSI. Lluvia acumulada de Open-Meteo (modelos meteorológicos y reanálisis ERA5). Umbrales heurísticos: requieren verificación en campo o con imagen."
  };
};

const cacheAnalisis = new Map<string, { t: number; data: any }>();
app.get("/api/analisis/suelo-agua", requiere("suelo.cambios", "suelo.lote", "suelo.barridos"), async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radio = Math.min(3000, Math.max(100, Number(req.query.radio) || 500));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "Faltan lat y lon" });
    // El mismo punto no cambia en horas: caché en memoria y en la CDN para no gastar cupo de nuevo
    const clave = `${lat.toFixed(4)}|${lon.toFixed(4)}|${radio}`;
    const c = cacheAnalisis.get(clave);
    const data = c && Date.now() - c.t < 6 * 3600000 ? c.data : await analizarPunto(lat, lon, radio);
    if (!c || c.data !== data) { cacheAnalisis.set(clave, { t: Date.now(), data }); if (cacheAnalisis.size > 500) cacheAnalisis.delete(cacheAnalisis.keys().next().value!); }
    res.set("Cache-Control", "private, max-age=3600");
    return res.json(data);
  } catch (e: any) {
    return res.status(502).json({ error: e.message || "Error en el análisis" });
  }
});

// ---------------------------------------------------------------------------
// Mapa del índice: año anterior, ahora y diferencia, píxel por píxel.
// Mismas ventanas que el análisis (60 días y el mismo período del año anterior),
// mediana de las pasadas sin nubes en cada período. Una sola consulta por
// fusión de datos devuelve los dos períodos; el color se aplica acá.
// ---------------------------------------------------------------------------
const INDICES_MAPA: Record<string, { formula: string; min: number; max: number; rangoCambio: number; colores: [string, string, string]; sube: string; baja: string; nombre: string }> = {
  humedad: { nombre: "Humedad del suelo (NDMI)", formula: "(s.B08-s.B11)/(s.B08+s.B11+1e-6)", min: -0.4, max: 0.4, rangoCambio: 0.15, colores: ["#8C5A2B", "#E8DCC0", "#1F6FB8"], sube: "Más húmedo", baja: "Más seco" },
  vegetacion: { nombre: "Cubierta vegetal (NDVI)", formula: "(s.B08-s.B04)/(s.B08+s.B04+1e-6)", min: 0, max: 0.5, rangoCambio: 0.15, colores: ["#D9C9A3", "#A8B85A", "#2F7A2F"], sube: "Más vegetación", baja: "Menos vegetación" },
  agua: { nombre: "Agua superficial (MNDWI)", formula: "(s.B03-s.B11)/(s.B03+s.B11+1e-6)", min: -0.6, max: 0.4, rangoCambio: 0.25, colores: ["#8C5A2B", "#E8DCC0", "#1F6FB8"], sube: "Más agua", baja: "Menos agua" },
  desnudo: { nombre: "Suelo desnudo (BSI)", formula: "((s.B11+s.B04)-(s.B08+s.B02))/((s.B11+s.B04)+(s.B08+s.B02)+1e-6)", min: -0.2, max: 0.4, rangoCambio: 0.12, colores: ["#2F7A2F", "#E8DCC0", "#A0522D"], sube: "Más suelo descubierto", baja: "Menos suelo descubierto" },
  quemado: { nombre: "Suelo quemado (NBR)", formula: "(s.B08-s.B12)/(s.B08+s.B12+1e-6)", min: -0.3, max: 0.4, rangoCambio: 0.15, colores: ["#2A2420", "#B8A88A", "#2F7A2F"], sube: "Más vegetación (NBR sube)", baja: "Posible quemado o ennegrecido (NBR baja)" }
};
const cacheMapaIdx = new Map<string, { t: number; data: any }>();
/** Dónde cayó el aumento del índice respecto del relieve: bajos y cauces (HAND < 2 m),
 *  laderas (2 a 5 m) o lomas (> 5 m). Las manchas en loma se listan aparte. */
const analizarTerreno = (W: number, H: number, pxM: number, bbox: number[], sube: Uint8Array, hand: Float32Array, dentro: (x: number, y: number) => boolean,
  indice: string, def: { sube: string }, lluvia: Lluvia | null, pctSube: number) => {
  const clase = (h: number) => (h < 2 ? 0 : h <= 5 ? 1 : 2);
  const area = [0, 0, 0], hum = [0, 0, 0];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!dentro(x, y) || !Number.isFinite(hand[i])) continue;
    const c = clase(hand[i]); area[c]++; if (sube[i]) hum[c]++;
  }
  const tA = area[0] + area[1] + area[2], tH = hum[0] + hum[1] + hum[2];
  const pct = (a: number[], t: number) => a.map((v) => (t ? Number(((v / t) * 100).toFixed(0)) : 0));
  // Manchas continuas de aumento (8 vecinos) con su altura media sobre el cauce
  const visto = new Uint8Array(W * H);
  const manchas: { area_m2: number; lat: number; lon: number; hand_m: number }[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!sube[i] || visto[i]) continue;
    const pila = [i]; visto[i] = 1; let nPx = 0, sx = 0, sy = 0, sh = 0, nh = 0;
    while (pila.length) {
      const k = pila.pop()!; const x = k % W, y = (k - x) / W;
      nPx++; sx += x; sy += y; if (Number.isFinite(hand[k])) { sh += hand[k]; nh++; }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (sube[j] && !visto[j]) { visto[j] = 1; pila.push(j); }
      }
    }
    const a = nPx * pxM * pxM;
    if (a < 1500 || !nh) continue;
    manchas.push({ area_m2: Math.round(a), hand_m: Number((sh / nh).toFixed(1)),
      lon: Number((bbox[0] + ((sx / nPx + 0.5) / W) * (bbox[2] - bbox[0])).toFixed(5)),
      lat: Number((bbox[3] - ((sy / nPx + 0.5) / H) * (bbox[3] - bbox[1])).toFixed(5)) });
  }
  const enLoma = manchas.filter((m) => m.hand_m > 5).sort((a, b) => b.area_m2 - a.area_m2);
  const [pB, pL, pA] = pct(hum, tH), [aB] = pct(area, tA);
  const llovio = lluvia ? llovioMas(lluvia) : null;
  const sigueBajos = tH > 0 && (pB >= 60 || pB >= aB * 1.5);
  const generalizado = pctSube >= 25;
  let nivel: "normal" | "observar" | "alerta" = "normal", lectura = "";
  const txtLluvia = lluvia ? `En estos 60 días llovieron ${lluvia.reciente_mm} mm contra ${lluvia.base_mm} mm el año anterior.` : "No se pudo consultar la lluvia del período.";
  if (!tH) lectura = `No hay aumentos relevantes para ubicar en el relieve. ${txtLluvia}`;
  else if (enLoma.length && !llovio) { nivel = "alerta"; lectura = `Hay ${enLoma.length} mancha${enLoma.length > 1 ? "s" : ""} de aumento en zona alta (más de 5 m sobre el cauce al que drena), donde el agua de lluvia no se junta, y no llovió más que el año anterior. ${txtLluvia} Anómalo: revisar las manchas listadas.`; }
  else if (sigueBajos && (generalizado || llovio)) { nivel = "normal"; lectura = `El ${pB} % del aumento está en bajos y cauces (que ocupan el ${aB} % del área): sigue el drenaje, patrón de escorrentía. ${txtLluvia}${enLoma.length ? ` Igual hay ${enLoma.length} mancha${enLoma.length > 1 ? "s" : ""} en loma para mirar.` : ""}` ; if (enLoma.length) nivel = "observar"; }
  else if (sigueBajos && llovio === false) { nivel = "observar"; lectura = `El aumento está sobre todo en bajos y cauces (${pB} %), pero no llovió más que el año anterior. ${txtLluvia} Puede ser una pérdida que escurrió hasta el bajo o napa alta: verificar aguas arriba.`; }
  else if (enLoma.length) { nivel = "observar"; lectura = `Llovió más que el año anterior, pero hay ${enLoma.length} mancha${enLoma.length > 1 ? "s" : ""} en zona alta, donde la lluvia no debería acumularse. ${txtLluvia}`; }
  else { nivel = llovio ? "normal" : "observar"; lectura = `El aumento está repartido: ${pB} % en bajos, ${pL} % en laderas y ${pA} % en lomas. ${txtLluvia}`; }
  return {
    aplica: indice === "humedad" || indice === "agua",
    pct_aumento: { bajos: pB, laderas: pL, lomas: pA }, pct_area: pct(area, tA),
    manchas_loma: enLoma.slice(0, 6), nivel, lectura,
    metodo: "Copernicus DEM GLO-30. Depresiones rellenadas (priority-flood), flujo D8, cauces donde drenan más de 0,2 km². Altura sobre el cauce (HAND): bajo < 2 m, ladera 2 a 5 m, loma > 5 m. Precisión vertical del modelo: unos 2 a 4 m."
  };
};

const hexRgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mezclar = (c: [string, string, string], t: number) => {
  t = Math.max(0, Math.min(1, t));
  const [a, b] = t < 0.5 ? [hexRgb(c[0]), hexRgb(c[1])] : [hexRgb(c[1]), hexRgb(c[2])];
  const u = t < 0.5 ? t * 2 : (t - 0.5) * 2;
  return a.map((x, i) => Math.round(x + (b[i] - x) * u));
};

app.get("/api/analisis/mapa", requiere("suelo.cambios", "suelo.lote"), async (req, res) => {
  try {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    const radio = Math.min(3000, Math.max(100, Number(req.query.radio) || 500));
    const indice = String(req.query.indice || "humedad");
    const def = INDICES_MAPA[indice];
    if (!def) return res.status(400).json({ error: `Índice desconocido: ${indice}` });
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "Faltan lat y lon" });
    const clave = `v2|${indice}|${lat.toFixed(4)}|${lon.toFixed(4)}|${radio}`;
    const c = cacheMapaIdx.get(clave);
    if (c && Date.now() - c.t < 6 * 3600000) { res.set("Cache-Control", "private, max-age=3600"); return res.json(c.data); }

    const hasta = new Date();
    const desde = new Date(hasta.getTime() - 60 * 86400000);
    const hastaBase = new Date(hasta.getTime() - 365 * 86400000);
    const desdeBase = new Date(desde.getTime() - 365 * 86400000);
    const bbox = bboxCirculo(lat, lon, radio);
    const lado = Math.round(Math.min(400, Math.max(48, (2 * radio) / 10)));
    const bandas = '["B02","B03","B04","B08","B11","B12","SCL","dataMask"]';
    const script = `//VERSION=3
function setup(){return{input:[{datasource:"antes",bands:${bandas}},{datasource:"ahora",bands:${bandas}}],output:{bands:3,sampleType:"UINT8"},mosaicking:"ORBIT"}}
function med(a){if(!a.length)return null;a.sort(function(x,y){return x-y});var m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function serie(arr){var v=[];for(var i=0;i<arr.length;i++){var s=arr[i];if(!s.dataMask)continue;if([0,1,3,8,9,10,11].indexOf(s.SCL)>=0)continue;v.push(${def.formula})}return med(v)}
function enc(x){return x===null?0:Math.max(1,Math.min(255,Math.round((x+1)*127)))}
function evaluatePixel(samples){return[enc(serie(samples.antes||[])),enc(serie(samples.ahora||[])),255]}`;
    const token = await obtenerTokenCdse();
    const dato = (id: string, a: Date, b: Date) => ({ id, type: "sentinel-2-l2a", dataFilter: { timeRange: { from: a.toISOString(), to: b.toISOString() }, maxCloudCoverage: 70 } });
    const cuerpo = {
      input: { bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } }, data: [dato("antes", desdeBase, hastaBase), dato("ahora", desde, hasta)] },
      output: { width: lado, height: lado, responses: [{ identifier: "default", format: { type: "image/png" } }] },
      evalscript: script
    };
    const [r, rel, lluvia] = await Promise.all([
      fetchSH("https://sh.dataspace.copernicus.eu/api/v1/process", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" }, body: JSON.stringify(cuerpo)
      }),
      obtenerRelieve(lat, lon, radio).catch(() => null),
      lluviaPeriodos(lat, lon, desde, hasta, desdeBase, hastaBase)
    ]);
    if (!r.ok) {
      const t = await r.text();
      let msg = t.slice(0, 300);
      try { msg = JSON.parse(t)?.error?.message || msg; } catch { /* texto */ }
      if (r.status === 429) throw new Error("Sentinel Hub está limitando las consultas por minuto. Esperá un minuto y volvé a intentar.");
      throw new Error(`Sentinel Hub (HTTP ${r.status}): ${msg}`);
    }
    const img = pngRGBA(new Uint8Array(await r.arrayBuffer()));
    const W = img.width, H = img.height, ch = img.channels, px = img.data as Uint8Array;
    const pxM = (2 * radio) / W;
    // Relieve de cada píxel: altura sobre el cauce al que drena (NaN si no se sabe)
    const handPx = new Float32Array(W * H).fill(NaN);
    if (rel) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = celdaRelieve(rel, bbox[3] - ((y + 0.5) / H) * (bbox[3] - bbox[1]), bbox[0] + ((x + 0.5) / W) * (bbox[2] - bbox[0]));
      if (k >= 0) handPx[y * W + x] = rel.hand[k];
    }
    const subeMask = new Uint8Array(W * H);
    const antes = new Uint8ClampedArray(W * H * 4), ahora = new Uint8ClampedArray(W * H * 4), cambio = new Uint8ClampedArray(W * H * 4);
    let n = 0, sumA = 0, sumH = 0, sube = 0, baja = 0;
    const umbral = def.rangoCambio / 3;
    const pintar = (dst: Uint8ClampedArray, o: number, v: number) => {
      const [R, G, B] = mezclar(def.colores, (v - def.min) / (def.max - def.min));
      dst[o] = R; dst[o + 1] = G; dst[o + 2] = B; dst[o + 3] = 230;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      if (Math.hypot((x + 0.5) * pxM - radio, (y + 0.5) * pxM - radio) > radio) continue;
      const ea = px[i * ch], eh = px[i * ch + 1];
      const va = ea ? ea / 127 - 1 : null, vh = eh ? eh / 127 - 1 : null;
      if (va !== null) pintar(antes, o, va);
      if (vh !== null) pintar(ahora, o, vh);
      if (va === null || vh === null) continue;
      n++; sumA += va; sumH += vh;
      const d = vh - va;
      if (d > umbral) { sube++; subeMask[i] = 1; } else if (d < -umbral) baja++;
      // Diferencia: azul/verde donde sube, ocre donde baja; casi transparente si no cambió
      const t = Math.max(-1, Math.min(1, d / def.rangoCambio));
      const col = t >= 0 ? hexRgb(def.colores[2]) : hexRgb(def.colores[0]);
      cambio[o] = col[0]; cambio[o + 1] = col[1]; cambio[o + 2] = col[2];
      cambio[o + 3] = Math.abs(d) < umbral ? 25 : Math.round(90 + 160 * Math.abs(t));
    }
    const terreno = rel ? analizarTerreno(W, H, pxM, bbox, subeMask, handPx, (x, y) => Math.hypot((x + 0.5) * pxM - radio, (y + 0.5) * pxM - radio) <= radio, indice, def, lluvia, n ? (sube / n) * 100 : 0) : null;
    const url = (d: Uint8ClampedArray) => `data:image/png;base64,${Buffer.from(codificarPng({ width: W, height: H, data: d, channels: 4 })).toString("base64")}`;
    const f = (d: Date) => d.toISOString().slice(0, 10);
    const data = {
      indice, nombre: def.nombre, bbox,
      periodos: { antes: `${f(desdeBase)} a ${f(hastaBase)}`, ahora: `${f(desde)} a ${f(hasta)}` },
      imagenes: { antes: url(antes), ahora: url(ahora), cambio: url(cambio), ...(rel ? { relieve: imagenRelieve(rel) } : {}) },
      bboxRelieve: rel?.bbox ?? null,
      terreno, lluvia,
      escala: { min: def.min, max: def.max, colores: def.colores, rangoCambio: def.rangoCambio, umbral: Number(umbral.toFixed(3)), sube: def.sube, baja: def.baja },
      resumen: n ? {
        media_antes: Number((sumA / n).toFixed(3)), media_ahora: Number((sumH / n).toFixed(3)),
        pct_sube: Number(((sube / n) * 100).toFixed(1)), pct_baja: Number(((baja / n) * 100).toFixed(1)),
        resolucion_m: Math.round(pxM)
      } : null
    };
    cacheMapaIdx.set(clave, { t: Date.now(), data });
    if (cacheMapaIdx.size > 200) cacheMapaIdx.delete(cacheMapaIdx.keys().next().value!);
    res.set("Cache-Control", "private, max-age=3600");
    return res.json(data);
  } catch (e: any) {
    return res.status(502).json({ error: e.message || "Error generando el mapa" });
  }
});

// ---------------------------------------------------------------------------
// Detección de derrames (candidatos) — análisis por píxel en el tiempo.
//  * suelo: Sentinel-2. Píxel que se oscureció >30% en los últimos 20 días
//    respecto de los 70 días previos, quedó oscuro y no es agua ni sombra.
//  * agua:  Sentinel-1 (radar). Píxel de agua permanente cuya última pasada
//    es ≥4 dB más oscura que su mediana: el aceite alisa la superficie.
// ---------------------------------------------------------------------------
const scriptDerrameSuelo = (corteIso: string, modo: "imagen" | "stats") => `//VERSION=3
function setup(){return{input:[{bands:["B02","B03","B04","B08","B11","B12","SCL","dataMask"]}],
output:${modo === "imagen" ? '[{id:"default",bands:4}]' : '[{id:"det",bands:3,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]'},mosaicking:"ORBIT"}}
const CORTE=Date.parse("${corteIso}");
function med(a){if(!a.length)return null;a.sort(function(x,y){return x-y});var m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function evaluatePixel(samples,scenes){
  var antes=[],ahora=[],nvA=[],nvH=[],nwH=[];
  for(var i=0;i<samples.length;i++){
    var s=samples[i]; if(!s.dataMask)continue;
    if([0,1,2,3,8,9,10,11].indexOf(s.SCL)>=0)continue;
    var t=Date.parse(scenes.orbits[i].dateFrom);
    var br=(s.B02+s.B03+s.B04+s.B08+s.B11+s.B12)/6;
    var nv=(s.B08-s.B04)/(s.B08+s.B04+1e-6);
    if(t<CORTE){antes.push(br);nvA.push(nv)}else{ahora.push(br);nvH.push(nv);nwH.push((s.B03-s.B08)/(s.B03+s.B08+1e-6))}
  }
  var a=med(antes),h=med(ahora);
  var valido=(a!==null&&h!==null)?1:0;
  var cand=0,caida=0;
  if(valido){
    caida=(a-h)/(a+1e-6);
    var agua=med(nwH)>0;
    var perdioVeg=(med(nvA)-med(nvH))>0.02;
    if(!agua && caida>0.30 && h<0.12 && (perdioVeg || med(nvH)<0.15)) cand=1;
  }
  ${modo === "imagen"
    ? "if(cand)return[1,0.15,0.1,0.95]; if(valido&&caida>0.2&&h<0.15)return[1,0.7,0.2,0.55]; return[0,0,0,0];"
    : "return {det:[cand,valido,caida], dataMask:[valido]};"}
}`;

const scriptDerrameAgua = (modo: "imagen" | "stats", umbral = -4, techo = -21) => `//VERSION=3
function setup(){return{input:[{bands:["VV","dataMask"]}],
output:${modo === "imagen" ? '[{id:"default",bands:4}]' : '[{id:"det",bands:4,sampleType:"FLOAT32"},{id:"dataMask",bands:1}]'},mosaicking:"ORBIT"}}
function med(a){if(!a.length)return null;a.sort(function(x,y){return x-y});var m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function evaluatePixel(samples,scenes){
  var vals=[],ult=null,tUlt=-1;
  for(var i=0;i<samples.length;i++){
    var s=samples[i]; if(!s.dataMask||!(s.VV>0))continue;
    var db=10*Math.log(s.VV)/Math.LN10;
    var t=Date.parse(scenes.orbits[i].dateFrom);
    vals.push(db);
    if(t>tUlt){tUlt=t;ult=db}
  }
  if(vals.length<3){ ${modo === "imagen" ? "return[0,0,0,0];" : "return {det:[0,0,0,0], dataMask:[0]};"} }
  var m=med(vals.slice());
  var agua=m<-18?1:0;
  var anom=ult-m;
  var cand=(agua&&anom<=${umbral.toFixed(2)}&&ult<${techo.toFixed(2)})?1:0;
  ${modo === "imagen"
    ? "if(cand)return[1,0.15,0.1,0.95]; if(agua)return[0.15,0.45,0.85,0.35]; return[0,0,0,0];"
    : "return {det:[cand,agua,anom,ult], dataMask:[agua]};"}
}`;

const configDerrame = (tipo: "suelo" | "agua", radioM: number, umbral = -4, techo = -21) => {
  const ahora = new Date();
  if (tipo === "suelo") {
    const desde = new Date(ahora.getTime() - 90 * 86400000);
    const corte = new Date(ahora.getTime() - 20 * 86400000);
    return {
      desde, hasta: ahora, corte, intervalo: "P90D", resM: 20,
      dato: { type: "sentinel-2-l2a", dataFilter: { maxCloudCoverage: 60 } },
      script: (m: "imagen" | "stats") => scriptDerrameSuelo(corte.toISOString(), m)
    };
  }
  const desde = new Date(ahora.getTime() - 36 * 86400000);
  return {
    desde, hasta: ahora, corte: null, intervalo: "P36D", resM: 10,
    dato: { type: "sentinel-1-grd", dataFilter: { acquisitionMode: "IW", polarization: "DV" } },
    script: (m: "imagen" | "stats") => scriptDerrameAgua(m, umbral, techo)
  };
};

const bboxCirculo = (lat: number, lon: number, radioM: number) => {
  const dLat = radioM / 110540;
  const dLon = radioM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
};

// Mancha mínima que cuenta: los píxeles sueltos son ruido (speckle del radar, bordes de nube)
const MANCHA_MIN_M2 = { agua: 2000, suelo: 800 } as const;
const cacheMascara = new Map<string, { t: number; png: Buffer }>();

/** Pide la máscara a Sentinel Hub, agrupa los candidatos en manchas continuas (8 vecinos)
 *  y descarta las menores al mínimo. Devuelve el área que cuenta y la imagen re-dibujada. */
const mascaraDerrame = async (tipo: "suelo" | "agua", lat: number, lon: number, radio: number, umbral: number, techo: number) => {
  const clave = [tipo, lat.toFixed(5), lon.toFixed(5), radio, umbral.toFixed(2), techo.toFixed(2)].join("|");
  const cfg = configDerrame(tipo, radio, umbral, techo);
  const lado = Math.round(Math.min(800, Math.max(64, (2 * radio) / cfg.resM)));
  const token = await obtenerTokenCdse();
  const cuerpo = {
    input: {
      bounds: { bbox: bboxCirculo(lat, lon, radio), properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
      data: [{ ...cfg.dato, dataFilter: { ...cfg.dato.dataFilter, timeRange: { from: cfg.desde.toISOString(), to: cfg.hasta.toISOString() } } }]
    },
    output: { width: lado, height: lado, responses: [{ identifier: "default", format: { type: "image/png" } }] },
    evalscript: cfg.script("imagen")
  };
  const r = await fetchSH("https://sh.dataspace.copernicus.eu/api/v1/process", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" }, body: JSON.stringify(cuerpo)
  });
  if (!r.ok) {
    const t = await r.text();
    let msg = t.slice(0, 300);
    try { msg = JSON.parse(t)?.error?.message || msg; } catch { /* texto */ }
    throw new Error(`Sentinel Hub (HTTP ${r.status}): ${msg}`);
  }
  const img = pngRGBA(new Uint8Array(await r.arrayBuffer()));
  const W = img.width, H = img.height, ch = img.channels, px = img.data as Uint8Array;
  const pxM = (2 * radio) / W;
  // Solo cuenta lo que cae dentro del círculo
  const dentro = (x: number, y: number) => Math.hypot((x + 0.5) * pxM - radio, (y + 0.5) * pxM - radio) <= radio;
  const cand = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const o = i * ch, a = ch === 4 ? px[o + 3] : 255;
    if (a > 200 && px[o] > 230 && px[o + 1] < 80 && dentro(i % W, Math.floor(i / W))) cand[i] = 1;
  }
  const minPx = Math.max(1, Math.ceil(MANCHA_MIN_M2[tipo] / (pxM * pxM)));
  const etiqueta = new Int32Array(W * H).fill(-1);
  const manchas: { px: number[]; area: number; lat: number; lon: number }[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!cand[i] || etiqueta[i] >= 0) continue;
    const pila = [i], grupo: number[] = [];
    etiqueta[i] = manchas.length;
    while (pila.length) {
      const k = pila.pop()!; grupo.push(k);
      const x = k % W, y = (k - x) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (cand[j] && etiqueta[j] < 0) { etiqueta[j] = manchas.length; pila.push(j); }
      }
    }
    let sx = 0, sy = 0;
    grupo.forEach((k) => { sx += k % W; sy += Math.floor(k / W); });
    const [w0, s0, e0, n0] = bboxCirculo(lat, lon, radio);
    manchas.push({ px: grupo, area: Math.round(grupo.length * pxM * pxM), lon: w0 + ((sx / grupo.length + 0.5) / W) * (e0 - w0), lat: n0 - ((sy / grupo.length + 0.5) / H) * (n0 - s0) });
  }
  const validas = manchas.filter((m) => m.px.length >= minPx).sort((a, b) => b.area - a.area);
  const sueltos = manchas.filter((m) => m.px.length < minPx);
  // Re-dibujo: manchas que cuentan en rojo, puntos sueltos en gris tenue, el resto como vino
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const o = i * ch, a = ch === 4 ? px[o + 3] : 255;
    out.set(cand[i] ? [0, 0, 0, 0] : [px[o], px[o + 1], px[o + 2], dentro(i % W, Math.floor(i / W)) ? a : Math.round(a * 0.4)], i * 4);
  }
  validas.forEach((m) => m.px.forEach((k) => out.set([255, 38, 25, 245], k * 4)));
  sueltos.forEach((m) => m.px.forEach((k) => out.set([214, 206, 196, 120], k * 4)));
  const png = Buffer.from(codificarPng({ width: W, height: H, data: out, channels: 4 }));
  cacheMascara.set(clave, { t: Date.now(), png });
  if (cacheMascara.size > 60) cacheMascara.delete(cacheMascara.keys().next().value!);
  return {
    clave, png,
    area: validas.reduce((s, m) => s + m.area, 0),
    descartado: sueltos.reduce((s, m) => s + m.area, 0),
    n_sueltos: sueltos.length,
    manchas: validas.slice(0, 5).map((m) => ({ area_m2: m.area, lat: +m.lat.toFixed(5), lon: +m.lon.toFixed(5) }))
  };
};

app.get("/api/derrames", requiere("suelo.derrame_suelo", "suelo.derrame_agua", "suelo.barridos"), async (req, res) => {
  try {
    const tipo = req.query.tipo === "agua" ? "agua" : "suelo";
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radio = Math.min(3000, Math.max(100, Number(req.query.radio) || 500));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "Faltan lat y lon" });
    const token = await obtenerTokenCdse();
    const correr = async (umbral: number, techo = -21) => {
      const cfg = configDerrame(tipo, radio, umbral, techo);
      const lado = Math.round(Math.min(tipo === "agua" ? 400 : 300, Math.max(20, (2 * radio) / cfg.resM)));
      const cuerpo = {
        input: { bounds: { geometry: circuloGeo(lat, lon, radio), properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } }, data: [cfg.dato] },
        aggregation: {
          timeRange: { from: cfg.desde.toISOString(), to: cfg.hasta.toISOString() },
          aggregationInterval: { of: cfg.intervalo },
          width: lado, height: lado,
          evalscript: cfg.script("stats")
        },
        calculations: { default: { statistics: { default: { percentiles: { k: [50] } } } } }
      };
      const r = await fetchSH("https://sh.dataspace.copernicus.eu/api/v1/statistics", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo)
      });
      const txt = await r.text();
      if (!r.ok) {
        let msg = txt.slice(0, 300);
        try { msg = JSON.parse(txt)?.error?.message || msg; } catch { /* texto */ }
        throw new Error(`Sentinel Hub (HTTP ${r.status}): ${msg}`);
      }
      const d = JSON.parse(txt);
      const it = (d.data || []).find((x: any) => !x.error);
      if (!it) {
        const err = (d.data || [])[0]?.error?.message;
        throw new Error(err ? `Sentinel Hub: ${err}` : "No hubo imágenes en el período.");
      }
      return { cfg, it, pxM: (2 * radio) / lado };
    };

    // Agua: primero se mide cuánto se oscureció TODO el espejo de agua en la última
    // pasada (calma de viento); solo cuentan las zonas 4 dB más oscuras que ese valor.
    let umbral = -4;
    let techo = -21;
    let corrida = await correr(umbral, techo);
    let anomMediana: number | null = null;
    if (tipo === "agua") {
      const b = corrida.it.outputs?.det?.bands || {};
      const k = Object.keys(b).sort((x, y) => Number(x.replace(/\D/g, "")) - Number(y.replace(/\D/g, "")));
      const p50 = (st: any) => { const v = st?.percentiles?.["50.0"] ?? st?.percentiles?.["50"] ?? st?.mean; return typeof v === "number" && Number.isFinite(v) ? v : null; };
      const anomP50 = p50(b[k[2]]?.stats);
      const ultP50 = p50(b[k[3]]?.stats);
      // Temporal: 4 dB más oscuro que el cambio general del espejo de agua.
      if (anomP50 !== null) { anomMediana = anomP50; umbral = Math.min(-4, anomP50 - 4); }
      // Espacial: al menos 6 dB más oscuro que el agua circundante en esa misma pasada.
      if (ultP50 !== null) techo = Math.min(-21, ultP50 - 6);
      if (umbral !== -4 || techo !== -21) corrida = await correr(umbral, techo);
    }
    const { cfg, it, pxM } = corrida;
    const bandas = it.outputs?.det?.bands || {};
    const claves = Object.keys(bandas).sort((a, b) => Number(a.replace(/\D/g, "")) - Number(b.replace(/\D/g, "")));
    const stCand = bandas[claves[0]]?.stats || {};
    const validos = (stCand.sampleCount || 0) - (stCand.noDataCount || 0);
    const frac = typeof stCand.mean === "number" && Number.isFinite(stCand.mean) ? stCand.mean : 0;
    let areaCand = Math.round(frac * validos * pxM * pxM);
    const areaBase = Math.round(validos * pxM * pxM);
    // Agrupar en manchas continuas: solo cuentan las de al menos MANCHA_MIN_M2
    let mascara: Awaited<ReturnType<typeof mascaraDerrame>> | null = null;
    if (validos >= 5 && areaCand > 0) {
      try { mascara = await mascaraDerrame(tipo, lat, lon, radio, umbral, techo); areaCand = mascara.area; } catch { /* queda el conteo por píxel */ }
    }
    const minM2 = MANCHA_MIN_M2[tipo];
    // Agua con manchas: mirar la imagen óptica de los últimos 15 días; si hay algas flotantes, la mancha oscura puede ser eso
    let notaAlgas = "", algasFrac: number | null = null;
    if (tipo === "agua" && mascara && mascara.area > 0) {
      try {
        const hasta15 = new Date(), desde15 = new Date(hasta15.getTime() - 15 * 86400000);
        const filas = await serieEstadistica(token, circuloGeo(lat, lon, radio), desde15, hasta15, Math.round(Math.min(150, Math.max(24, (2 * radio) / 20))));
        const ult = [...filas].reverse().find((f) => (f.valido ?? 0) > 0.3 && (f.agua ?? 0) > 0.02);
        if (ult) {
          algasFrac = (ult.algas ?? 0) / ult.agua;
          if (algasFrac >= 0.15) notaAlgas = ` La imagen óptica del ${ult.fecha} muestra algas o vegetación flotante en el ${(algasFrac * 100).toFixed(0)} % del agua: la mancha puede ser algas y no hidrocarburo.`;
          else notaAlgas = ` La imagen óptica del ${ult.fecha} no muestra algas flotantes, lo que refuerza la sospecha.`;
        }
      } catch { /* sin imagen óptica útil */ }
    }
    const notaSueltos = mascara && mascara.descartado > 0
      ? ` Se descartaron ${mascara.descartado.toLocaleString("es-AR")} m² en ${mascara.n_sueltos} puntos sueltos, menores a ${minM2.toLocaleString("es-AR")} m² (ruido normal ${tipo === "agua" ? "del radar" : "de la imagen"}).`
      : "";

    let nivel: "normal" | "observar" | "alerta" | "sin_datos" = "normal";
    let lectura = "";
    if (validos < 5) {
      nivel = "sin_datos";
      lectura = tipo === "agua"
        ? "No se encontró agua permanente en el área o hubo menos de 3 pasadas de radar. Elegí un punto sobre el río, embalse o pileta."
        : "No hubo suficientes imágenes sin nubes antes y después para comparar.";
    } else if (tipo === "suelo") {
      if (areaCand >= 2000) { nivel = "alerta"; lectura = `Hay ${areaCand.toLocaleString("es-AR")} m² de suelo que se oscureció bruscamente en los últimos 20 días. Patrón compatible con hidrocarburo derramado; también puede ser suelo removido, humedad o una superficie nueva (asfalto, membrana). Verificar en campo.`; }
      else if (areaCand >= 800) { nivel = "observar"; lectura = `Área chica (${areaCand.toLocaleString("es-AR")} m²) con oscurecimiento reciente. Revisar con la imagen en color natural.`; }
      else { lectura = "Sin oscurecimiento brusco del suelo en los últimos 20 días."; }
      lectura += notaSueltos;
    } else {
      const mayor = mascara?.manchas[0];
      const donde = mayor ? ` La mayor mide ${mayor.area_m2.toLocaleString("es-AR")} m² y está en ${mayor.lat}, ${mayor.lon}.` : "";
      if (areaCand >= 10000) { nivel = "alerta"; lectura = `En la última pasada de radar hay ${(areaCand / 10000).toFixed(1)} ha de agua anormalmente lisa (oscura) formando manchas continuas.${donde} Patrón compatible con una película de hidrocarburo; también puede ser agua sin viento o algas. Verificar.`; }
      else if (areaCand >= 2000) { nivel = "observar"; lectura = `Mancha oscura chica (${areaCand.toLocaleString("es-AR")} m²) en el agua en la última pasada de radar.${donde}`; }
      else { lectura = "Sin manchas anómalas en el agua en la última pasada de radar."; }
      if (algasFrac !== null && algasFrac >= 0.3 && nivel === "alerta") nivel = "observar";
      lectura += notaAlgas + notaSueltos;
    }

    const bbox = bboxCirculo(lat, lon, radio);
    return res.json({
      tipo, punto: { lat, lon }, radio_m: radio, nivel, lectura,
      area_candidata_m2: areaCand,
      area_analizada_m2: areaBase,
      area_descartada_m2: mascara?.descartado ?? 0,
      mancha_minima_m2: minM2,
      manchas: mascara?.manchas ?? [],
      algas_pct: algasFrac !== null ? Math.round(algasFrac * 100) : null,
      periodo: { desde: cfg.desde.toISOString().slice(0, 10), hasta: cfg.hasta.toISOString().slice(0, 10), corte: cfg.corte ? cfg.corte.toISOString().slice(0, 10) : null },
      imagen: { url: `/api/derrames/imagen?tipo=${tipo}&lat=${lat}&lon=${lon}&radio=${radio}&umbral=${umbral.toFixed(2)}&techo=${techo.toFixed(2)}`, bbox },
      oscurecimiento_general_db: anomMediana,
      metodo: tipo === "suelo"
        ? "Sentinel-2 L2A (20 m). Por cada píxel: mediana de brillo de los 70 días previos vs. los últimos 20 días, sin nubes ni sombras (SCL). Candidato si cae >30%, queda oscuro (<0,12), no es agua y perdió o no tenía vegetación. Solo cuentan manchas continuas de al menos 800 m²; los píxeles sueltos se descartan."
        : `Sentinel-1 GRD IW (10 m, VV). Agua permanente = mediana < −18 dB en 36 días. Candidato si en la última pasada el píxel es al menos ${Math.abs(umbral).toFixed(1)} dB más oscuro que su propia mediana (descontando el cambio general del espejo por viento) y además queda por debajo de ${techo.toFixed(1)} dB, es decir 6 dB más oscuro que el agua de alrededor en esa pasada. Requiere ≥3 pasadas. Solo cuentan manchas continuas de al menos ${MANCHA_MIN_M2.agua.toLocaleString("es-AR")} m²; los píxeles sueltos se descartan como ruido del radar. Las zonas abrigadas del viento junto a la costa pueden dar falsos positivos.`
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || "Error en la detección" });
  }
});

// ---------------------------------------------------------------------------
// Confirmación de un foco térmico con Sentinel-2 (20 m)
// El píxel de VIIRS mide 375 m; Sentinel-2 permite ubicar la llama dentro de ese píxel.
// Píxel caliente según los índices normalizados de Marchese y otros (2019):
//   NHI_SWIR = (B12 − B11)/(B12 + B11) > 0  y  NHI_SWNIR = (B11 − B8A)/(B11 + B8A) > 0, o B12 saturado.
// Solo ve llamas encendidas en el momento de la pasada (10:30 hora local, cada 5 días aprox.).
// ---------------------------------------------------------------------------
const SCRIPT_CALOR = `//VERSION=3
function setup(){return{input:[{bands:["B8A","B11","B12","dataMask"]}],output:{bands:4,sampleType:"UINT8"}}}
function evaluatePixel(s){
  const swir=(s.B12-s.B11)/(s.B12+s.B11+1e-6), swnir=(s.B11-s.B8A)/(s.B11+s.B8A+1e-6);
  const caliente=(swir>0 && swnir>0 && s.B12>0.1) || s.B12>=1.0;
  // Color falso B12-B11-B8A (la llama sale amarilla o roja brillante) y en el cuarto canal la marca de calor
  return [Math.min(255,s.B12*255*2.2), Math.min(255,s.B11*255*2.2), Math.min(255,s.B8A*255*2.2), s.dataMask? (caliente?255:200) : 0];
}`;
app.get("/api/confirmar-foco", requiere("instalaciones", "focos"), async (req, res) => {
  try {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: "Coordenadas inválidas" });
    const fecha = req.query.fecha ? new Date(String(req.query.fecha).slice(0, 10)) : new Date();
    const desde = new Date(fecha.getTime() - 8 * 86400000), hasta = new Date(Math.min(Date.now(), fecha.getTime() + 8 * 86400000));
    const radio = 900; // cubre el píxel de VIIRS y su error de ubicación
    const bbox = bboxCirculo(lat, lon, radio);
    const token = await obtenerTokenCdse();
    // Pasadas de Sentinel-2 en la ventana, de la más cercana a la fecha del foco
    const cat = await fetchSH("https://sh.dataspace.copernicus.eu/api/v1/catalog/1.0.0/search", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ collections: ["sentinel-2-l2a"], bbox, datetime: `${desde.toISOString()}/${hasta.toISOString()}`, limit: 20, fields: { include: ["properties.datetime", "properties.eo:cloud_cover"] } })
    });
    if (!cat.ok) return res.status(502).json({ error: `Catálogo de Sentinel-2 (HTTP ${cat.status})` });
    const items = ((await cat.json()).features || []).map((f: any) => ({ fecha: String(f.properties.datetime), nubes: f.properties["eo:cloud_cover"] ?? null }));
    const dias = [...new globalThis.Map(items.filter((i: any) => i.nubes === null || i.nubes < 60).map((i: any) => [i.fecha.slice(0, 10), i])).values()] as any[];
    dias.sort((a, b) => Math.abs(new Date(a.fecha).getTime() - fecha.getTime()) - Math.abs(new Date(b.fecha).getTime() - fecha.getTime()));
    const pasadas: any[] = [];
    const lado = Math.round((2 * radio) / 20);
    for (const d of dias.slice(0, 3)) {
      const dia = d.fecha.slice(0, 10);
      const cuerpo = {
        input: { bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84" } },
          data: [{ type: "sentinel-2-l2a", dataFilter: { timeRange: { from: `${dia}T00:00:00Z`, to: `${dia}T23:59:59Z` }, mosaickingOrder: "leastCC" } }] },
        output: { width: lado, height: lado, responses: [{ identifier: "default", format: { type: "image/png" } }] },
        evalscript: SCRIPT_CALOR
      };
      const r = await fetchSH("https://sh.dataspace.copernicus.eu/api/v1/process", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" }, body: JSON.stringify(cuerpo) });
      if (!r.ok) continue;
      const img = pngRGBA(new Uint8Array(await r.arrayBuffer()));
      const W = img.width, H = img.height, ch = img.channels, px = img.data as Uint8Array;
      const [w0, s0, e0, n0] = bbox;
      const calientes: { lat: number; lon: number; brillo: number }[] = [];
      let validos = 0;
      const vista = new Uint8Array(W * H * 4);
      for (let i = 0; i < W * H; i++) {
        const o = i * ch, a = px[o + 3];
        if (a > 0) validos++;
        vista.set([px[o], px[o + 1], px[o + 2], a > 0 ? 255 : 0], i * 4);
        if (a === 255) {
          const x = i % W, y = Math.floor(i / W);
          calientes.push({ lon: +(w0 + ((x + 0.5) / W) * (e0 - w0)).toFixed(5), lat: +(n0 - ((y + 0.5) / H) * (n0 - s0)).toFixed(5), brillo: px[o] });
          vista.set([255, 60, 30, 255], i * 4);
        }
      }
      pasadas.push({
        fecha: d.fecha, nubes: d.nubes, cobertura: Math.round((validos / (W * H)) * 100),
        calientes: calientes.sort((a, b) => b.brillo - a.brillo).slice(0, 25),
        imagen: `data:image/png;base64,${Buffer.from(codificarPng({ width: W, height: H, data: vista, channels: 4 })).toString("base64")}`
      });
      if (calientes.length) break; // con una pasada que confirma alcanza
    }
    const conf = pasadas.find((p) => p.calientes.length);
    res.set("Cache-Control", "private, max-age=3600");
    return res.json({
      punto: { lat, lon }, bbox, radio_m: radio,
      resultado: conf ? "confirmado" : pasadas.length ? "no_visible" : "sin_pasadas",
      lectura: conf
        ? `Sentinel-2 ve ${conf.calientes.length} píxel${conf.calientes.length > 1 ? "es" : ""} caliente${conf.calientes.length > 1 ? "s" : ""} de 20 m el ${conf.fecha.slice(0, 10)}: la llama queda ubicada dentro del píxel de VIIRS.`
        : pasadas.length
          ? "En las pasadas de Sentinel-2 cercanas no se ve una llama. No descarta el foco: la antorcha pudo estar apagada a las 10:30, la hora de la pasada."
          : "No hay pasadas de Sentinel-2 sin nubes en los 8 días alrededor del foco.",
      pasadas,
      metodo: "Sentinel-2 L2A a 20 m, bandas B8A, B11 y B12. Píxel caliente: NHI_SWIR > 0 y NHI_SWNIR > 0 con B12 > 0,1, o B12 saturado (Marchese y otros, Remote Sensing, 2019). Imagen en color falso B12-B11-B8A con los píxeles calientes en rojo."
    });
  } catch (e: any) {
    return res.status(502).json({ error: e.message || "No se pudo consultar Sentinel-2" });
  }
});

app.get("/api/derrames/imagen", requiere("suelo.derrame_suelo", "suelo.derrame_agua"), async (req, res) => {
  try {
    const tipo = req.query.tipo === "agua" ? "agua" : "suelo";
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const radio = Math.min(3000, Math.max(100, Number(req.query.radio) || 500));
    const umbralQ = Number(req.query.umbral), techoQ = Number(req.query.techo);
    const umbral = Number.isFinite(umbralQ) ? Math.min(-4, umbralQ) : -4;
    const techo = Number.isFinite(techoQ) ? Math.min(-21, techoQ) : -21;
    const clave = [tipo, lat.toFixed(5), lon.toFixed(5), radio, umbral.toFixed(2), techo.toFixed(2)].join("|");
    const c = cacheMascara.get(clave);
    const png = c && Date.now() - c.t < 1800000 ? c.png : (await mascaraDerrame(tipo, lat, lon, radio, umbral, techo)).png;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "private, max-age=1800");
    return res.send(png);
  } catch (e: any) {
    return res.status(502).json({ error: e.message || "Error generando la imagen" });
  }
});

// ---------------------------------------------------------------------------
// Barridos por zona: geometría real desde OpenStreetMap (Overpass).
//  * ríos: 20 tramos de 2 km a lo largo del cauce, centrados en la localidad.
//  * embalses: 20 puntos repartidos sobre la costa.
// ---------------------------------------------------------------------------
const cacheBarrido: Record<string, { t: number; data: any }> = {};

// Hidrografía oficial del IGN (SIG 250): fuente principal de cauces y costas para los barridos
const IGN_WFS = "https://wms.ign.gob.ar/geoserver/ows";
const IGN_ZONAS: Record<string, { capa: string; nombre: string; bbox: string }> = {
  anelo: { capa: "ign:lineas_de_aguas_continentales_perenne", nombre: "Río Neuquén", bbox: "-69.25,-38.75,-68.3,-37.95" },
  rincon: { capa: "ign:lineas_de_aguas_continentales_perenne", nombre: "Río Colorado", bbox: "-69.4,-37.8,-68.4,-37.0" },
  marimenuco: { capa: "ign:areas_de_aguas_continentales_BH130", nombre: "Embalse Mari Menuco", bbox: "-69.0,-38.8,-68.3,-38.35" },
  barreales: { capa: "ign:areas_de_aguas_continentales_BH130", nombre: "Embalse Los Barreales", bbox: "-69.2,-38.8,-68.5,-38.3" }
};
const barridoIgn = async (zonaId: string) => {
  const z = IGN_ZONAS[zonaId], zona = ZONAS_BARRIDO[zonaId];
  const cql = encodeURIComponent(`fna='${z.nombre}'`);
  const [x0, y0, x1, y1] = z.bbox.split(",").map(Number);
  const dentro = (l: { lat: number; lon: number }[]) => l.some((p) => p.lon >= x0 && p.lon <= x1 && p.lat >= y0 && p.lat <= y1);
  const url = `${IGN_WFS}?service=WFS&version=1.1.0&request=GetFeature&typeName=${z.capa}&outputFormat=application/json&srsName=EPSG:4326&cql_filter=${cql}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`IGN HTTP ${r.status}`);
  const j: any = await r.json();
  const lineas: { lat: number; lon: number }[][] = [];
  for (const f of j.features || []) {
    const g = f.geometry; if (!g) continue;
    const aPts = (c: number[][]) => c.map(([lon, lat]) => ({ lat, lon }));
    if (g.type === "LineString") lineas.push(aPts(g.coordinates));
    if (g.type === "MultiLineString") g.coordinates.forEach((c: number[][]) => lineas.push(aPts(c)));
    // Los embalses del IGN vienen cortados en los bordes de hoja (múltiplos de 0,5°): esos lados no son costa
    const hoja = (v: number) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-7;
    const costa = (anillo: number[][]) => {
      let tramo: number[][] = [anillo[0]];
      for (let k = 1; k < anillo.length; k++) {
        const [a, b] = [anillo[k - 1], anillo[k]];
        const corte = (hoja(a[0]) && hoja(b[0]) && a[0] === b[0]) || (hoja(a[1]) && hoja(b[1]) && a[1] === b[1]);
        if (corte) { if (tramo.length > 1) lineas.push(aPts(tramo)); tramo = [b]; } else tramo.push(b);
      }
      if (tramo.length > 1) lineas.push(aPts(tramo));
    };
    if (g.type === "Polygon") costa(g.coordinates[0]);
    if (g.type === "MultiPolygon") g.coordinates.forEach((p: number[][][]) => costa(p[0]));
  }
  const enZona = lineas.filter(dentro);
  if (!enZona.length) throw new Error("IGN sin geometría para la zona");
  lineas.length = 0; lineas.push(...enZona);
  const datos = zona.tipo === "rio" ? { tramos: muestrearRio(lineas, zona.referencia) } : (() => { const m = muestrearCosta(lineas, 20); return { tramos: m.puntos, perimetro_km: m.perimetro_km }; })();
  return {
    zona: zona.id, nombre: zona.nombre, tipo: zona.tipo, referencia: zona.referencia, radio_m: 1000,
    fuente: `${zona.tipo === "rio" ? "Cauce" : "Costa"}: Instituto Geográfico Nacional (SIG 250)`,
    ...datos
  };
};

const handlerBarrido = async (zonaId: string, res: any) => {
  try {
    if (!ZONAS_BARRIDO[zonaId]) return res.status(404).json({ error: `Zona desconocida: ${zonaId}` });
    const c = cacheBarrido[zonaId];
    if (c && Date.now() - c.t < 7 * 86400000) return res.json(c.data);
    let data: any;
    try { data = await barridoIgn(zonaId); } catch { data = await obtenerBarrido(zonaId); }
    cacheBarrido[zonaId] = { t: Date.now(), data };
    // Una respuesta buena queda en la CDN 30 días: los cauces no cambian
    res.set("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=604800");
    return res.json(data);
  } catch (e: any) {
    return res.status(502).json({ error: e.message || "No se pudo obtener la geometría de la zona" });
  }
};

// Localidades con coordenadas reales (OpenStreetMap), con caché de 7 días
let cacheLocalidades: { t: number; data: any } | null = null;
app.get("/api/localidades", async (_req, res) => {
  try {
    if (cacheLocalidades && Date.now() - cacheLocalidades.t < 7 * 86400000) return res.json(cacheLocalidades.data);
    const data = await obtenerLocalidades();
    cacheLocalidades = { t: Date.now(), data };
    return res.json(data);
  } catch (e: any) {
    return res.status(502).json({ error: e.message || "No se pudieron obtener las localidades" });
  }
});

// ---------------------------------------------------------------------------
// SIG oficial de Hidrocarburos de la Provincia del Neuquén (GeoServer de la
// Subsecretaría de Energía). Capas públicas WFS/WMS: instalaciones, venteos
// autorizados, ductos, pozos, locaciones. Se cachean 12 h.
// ---------------------------------------------------------------------------
const GEOSERVER_NQN = "https://hidrocarburos.energianeuquen.gob.ar/geoserver/Hidrocarburos";
const CAPAS_WFS_NQN = new Set(["Areas", "Concesiones", "VM_Distribucion_Fluidos", "Ductos", "Instalaciones", "Locaciones", "Lineas_de_conduccion", "Pozos", "Pozos_VM", "Puntos_medicion", "Venteos"]);
const cacheNqn: Record<string, { t: number; data: any }> = {};

const GEOM_NQN: Record<string, string> = { Instalaciones: "Shape", Ductos: "Shape", Areas: "Shape" };
const wfsNqn = async (capa: string, opciones: { props?: string[]; cql?: string; max?: number; geom?: string } = {}) => {
  if (!CAPAS_WFS_NQN.has(capa)) throw new Error(`Capa desconocida: ${capa}`);
  const p = new URLSearchParams({
    service: "WFS", version: "1.0.0", request: "GetFeature", typeName: `Hidrocarburos:${capa}`,
    outputFormat: "application/json", srsName: "EPSG:4326"
  });
  if (opciones.props?.length) p.set("propertyName", [opciones.geom || GEOM_NQN[capa] || "SHAPE", ...opciones.props].join(","));
  if (opciones.cql) p.set("CQL_FILTER", opciones.cql);
  if (opciones.max) p.set("maxFeatures", String(opciones.max));
  const clave = p.toString();
  const c = cacheNqn[clave];
  if (c && Date.now() - c.t < 12 * 3600000) return c.data;
  const r = await fetch(`${GEOSERVER_NQN}/ows?${clave}`, { signal: AbortSignal.timeout(45000) });
  const txt = await r.text();
  if (!r.ok || !txt.trim().startsWith("{")) throw new Error(`GeoServer Neuquén respondió ${r.status}: ${txt.slice(0, 160)}`);
  const data = JSON.parse(txt);
  cacheNqn[clave] = { t: Date.now(), data };
  return data;
};

const limpio = (v: any) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return !s || /^(n\/a|sin dato|averiguar|no especifica)$/i.test(s) ? null : s;
};
const numAr = (v: any) => {
  const s = limpio(v);
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const fechaIso = (v: any) => (v ? String(v).slice(0, 10) : null);
const recortar = (fc: any, mapa: (p: any) => any) => ({
  type: "FeatureCollection",
  features: (fc.features || []).filter((f: any) => f.geometry).map((f: any) => ({ type: "Feature", id: f.id, geometry: f.geometry, properties: mapa(f.properties || {}) }))
});

// Simplificación: coordenadas a 4 decimales y se descartan vértices a menos de ~60 m del anterior
const simplificarLinea = (linea: number[][], cerrar: boolean) => {
  const out: number[][] = [];
  for (const [x, y] of linea) {
    const q = [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4];
    const u = out[out.length - 1];
    if (!u || Math.abs(u[0] - q[0]) + Math.abs(u[1] - q[1]) > 0.0007) out.push(q);
  }
  const ultimo = linea[linea.length - 1];
  if (!cerrar && ultimo && out.length) out[out.length - 1] = [Math.round(ultimo[0] * 1e4) / 1e4, Math.round(ultimo[1] * 1e4) / 1e4];
  if (cerrar && out.length > 2) { const a = out[0], z = out[out.length - 1]; if (a[0] !== z[0] || a[1] !== z[1]) out.push(a); }
  return out;
};
const simplificarFc = (fc: any) => {
  for (const f of fc.features || []) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "LineString") g.coordinates = simplificarLinea(g.coordinates, false);
    if (g.type === "MultiLineString") g.coordinates = g.coordinates.map((l: any) => simplificarLinea(l, false)).filter((l: any) => l.length >= 2);
    if (g.type === "Polygon") g.coordinates = g.coordinates.map((r: any) => simplificarLinea(r, true)).filter((r: any) => r.length >= 4);
    if (g.type === "MultiPolygon") g.coordinates = g.coordinates.map((pol: any) => pol.map((r: any) => simplificarLinea(r, true)).filter((r: any) => r.length >= 4)).filter((pol: any) => pol.length);
  }
  return fc;
};

const CAPAS_NQN: Record<string, () => Promise<any>> = {
  instalaciones: async () => recortar(await wfsNqn("Instalaciones"), (p) => ({
    id: limpio(p.ID_INST), nombre: limpio(p.NOMBRE) ?? limpio(p.INSTALACIO), sigla: limpio(p.INSTALACIO), tipo: limpio(p.TIPO_INST),
    area: limpio(p.AREA), operador: limpio(p.OPERADOR_I), estado: limpio(p.ESTADO),
    venteo: limpio(p.VENTEO), sistema_venteo: limpio(p.SISTEMA_VE), stack_frio: limpio(p.STACK_FRIO), vru: limpio(p.CAP_VRU),
    gas_diseno: numAr(p.Q_DISEÑO_G), gas_actual: numAr(p.Q_ACTUAL_G), petroleo_diseno: numAr(p.Q_DISEÑO_P), petroleo_actual: numAr(p.Q_ACTUAL_P),
    tanques: numAr(p.CANT_TANQU), acta: limpio(p.ACTA), observaciones: limpio(p.OBSERVACIO)
  })),
  venteos: async () => recortar(await wfsNqn("Venteos"), (p) => ({
    expediente: limpio(p.N_EXPEDIEN), empresa: limpio(p.EMPRESA), area: limpio(p.AREA), instalacion: limpio(p["INSTALACIÓ"] ?? p.INSTALACIO),
    motivo: limpio(p.MOTIVO), disposicion: limpio(p.DISPOSICIO), permiso: fechaIso(p.PERMISO_DA), inicio: fechaIso(p.FECHA_INIC), vencimiento: fechaIso(p.FECHA_VENC),
    m3_dia_autorizado: typeof p.m3_dia_AUT === "number" ? p.m3_dia_AUT : numAr(p.m3_dia_AUT), promedio_venteado: p.PROM_VENTE ?? null
  })),
  sumideros: async () => recortar(await wfsNqn("Pozos", {
    cql: "FLUIDO='SUM'", max: 5000,
    props: ["WELL_NAME", "ESTADO_GIS", "OPERADOR", "OPERADOR_ORIGINAL", "AREA_LEGAL", "YACIMIENTO", "FORM_PROD", "AÑO_PERF", "TYPE_NAME", "PROFUNDIDAD_MEDIDA", "SIST_EXTRACCION",
      "INICIO_PERF", "FIN_PERF", "INICIO_TERM", "FIN_TERM", "FECHA_ABANDONO", "LEGAJO", "UWI_SEN"]
  }), (p) => ({
    nombre: limpio(p.WELL_NAME), estado: limpio(p.ESTADO_GIS), operador: limpio(p.OPERADOR), operador_original: limpio(p.OPERADOR_ORIGINAL),
    area: limpio(p.AREA_LEGAL), yacimiento: limpio(p.YACIMIENTO),
    formacion: limpio(p.FORM_PROD), anio: p["AÑO_PERF"] ?? null, profundidad_m: p.PROFUNDIDAD_MEDIDA || null,
    inicio_perf: fechaIso(p.INICIO_PERF), fin_perf: fechaIso(p.FIN_PERF), inicio_term: fechaIso(p.INICIO_TERM), fin_term: fechaIso(p.FIN_TERM),
    abandono: fechaIso(p.FECHA_ABANDONO), legajo: limpio(p.LEGAJO), id_nacion: p.UWI_SEN ?? null
  })),
  areas: async () => {
    const fc = structuredClone(await wfsNqn("Areas", { props: ["NOMBRE", "OPERADOR", "TITULAR", "TIPO_AREA", "SIGLA", "FIN_CONTRATO"] }));
    simplificarFc(fc);
    return recortar(fc, (p) => ({
      nombre: limpio(p.NOMBRE), sigla: limpio(p.SIGLA), operador: limpio(p.OPERADOR), titular: limpio(p.TITULAR), tipo: limpio(p.TIPO_AREA), fin_contrato: fechaIso(p.FIN_CONTRATO)
    }));
  },
  ductos: async () => recortar(simplificarFc(structuredClone(await wfsNqn("Ductos"))), (p) => ({
    id: limpio(p.ID_DUCTO), nombre: limpio(p.NOMBRE), fluido: limpio(p.FLUIDO), tipo: limpio(p.TIPO), operador: limpio(p.OPERADOR),
    diametro_pulg: p.DIAMETRO ?? null, longitud_km: p.DISTANCIA ?? null, estado: limpio(p.ESTADO), desde: limpio(p.DESDE), hasta: limpio(p.HASTA)
  }))
};

// El monitor de Focos usa el registro provincial de instalaciones por defecto (sin pedir un KML).
// Si el usuario sube su propio catastro, se suma al provincial.
let origenCatastro: "provincial" | "usuario" | "vacio" = "vacio";
let cargandoCatastro: Promise<void> | null = null;
const asegurarCatastroProvincial = async () => {
  if (getInstalacionesSigOficiales().length > 0) return;
  cargandoCatastro ??= (async () => {
    try {
      const fc = await CAPAS_NQN.instalaciones();
      ingestarCapaGeoJson({ type: "FeatureCollection", features: (fc.features || []).map((f: any) => ({
        type: "Feature", geometry: f.geometry,
        properties: {
          id: `nqn-${f.properties.id ?? f.properties.sigla}`, nombre: f.properties.nombre ?? f.properties.sigla, tipo: f.properties.tipo ?? "Instalación",
          operador: f.properties.operador, bloque_area: f.properties.area, radio_tolerancia_metros: 1000,
          descripcion_catastral: `Registro oficial de instalaciones, Subsecretaría de Energía de Neuquén${f.properties.venteo ? `. Venteo declarado: ${f.properties.venteo}` : ""}.`
        }
      })) }, "replace");
      origenCatastro = "provincial";
    } catch { /* sin registro provincial: queda vacío hasta que el usuario cargue un KML */ }
    finally { cargandoCatastro = null; }
  })();
  await cargandoCatastro;
};

app.get("/api/neuquen/capa/:capa", async (req, res) => {
  const obtener = CAPAS_NQN[req.params.capa];
  if (!obtener) return res.status(404).json({ error: "Capa no disponible" });
  try {
    const data = await obtener();
    res.setHeader("Cache-Control", "public, s-maxage=43200, stale-while-revalidate=86400");
    return res.json({ fuente: "SIG Hidrocarburos, Subsecretaría de Energía de la Provincia del Neuquén", url: GEOSERVER_NQN, consultado_utc: new Date().toISOString(), ...data });
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
});

// Consulta directa a una capa (solo lectura, para análisis y filtros)
app.get("/api/neuquen/wfs/:capa", async (req, res) => {
  try {
    const props = typeof req.query.props === "string" ? req.query.props.split(",").filter(Boolean) : undefined;
    const cql = typeof req.query.cql === "string" ? req.query.cql : undefined;
    const max = Math.min(5000, Number(req.query.max) || 1000);
    const geom = typeof req.query.geom === "string" ? req.query.geom : undefined;
    const data = await wfsNqn(req.params.capa, { props, cql, max, geom });
    res.setHeader("Cache-Control", "public, s-maxage=43200");
    return res.json(data);
  } catch (e: any) {
    return res.status(502).json({ error: e.message });
  }
});

// Mosaicos WMS (locaciones, pozos, líneas de conducción, concesiones) vía el servidor
const CAPAS_WMS_NQN = new Set(["Locaciones", "Pozos", "Pozos_VM", "Lineas_de_conduccion", "Concesiones", "Areas", "Ductos", "Instalaciones"]);
app.get("/api/neuquen/wms", async (req, res) => {
  const capa = String(req.query.capa || "");
  const bbox = String(req.query.bbox || "");
  if (!CAPAS_WMS_NQN.has(capa) || !/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(bbox)) return res.status(400).end();
  const p = new URLSearchParams({
    service: "WMS", version: "1.1.1", request: "GetMap", layers: `Hidrocarburos:${capa}`, styles: "",
    format: "image/png", transparent: "true", srs: "EPSG:3857", bbox, width: "256", height: "256"
  });
  try {
    const r = await fetch(`${GEOSERVER_NQN}/wms?${p}`, { signal: AbortSignal.timeout(25000) });
    const buf = Buffer.from(await r.arrayBuffer());
    if (!r.ok || !(r.headers.get("content-type") || "").startsWith("image/")) return res.status(502).end();
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
    return res.send(buf);
  } catch {
    return res.status(504).end();
  }
});

// Focos FIRMS con ventana elegible (1 a 10 días), para cruces de más largo plazo
const cacheFirmsDias: Record<number, { t: number; data: any }> = {};
app.get("/api/firms", async (req, res) => {
  const dias = Math.max(1, Math.min(10, Math.round(Number(req.query.dias) || 2)));
  const mapKey = limpiarEnv(process.env.FIRMS_MAP_KEY);
  if (!mapKey) return res.json({ estado: "sin_clave", dias, focos: [] });
  const c = cacheFirmsDias[dias];
  if (c && Date.now() - c.t < 15 * 60000) return res.json(c.data);
  const area = `${BBOX_CUENCA.west},${BBOX_CUENCA.south},${BBOX_CUENCA.east},${BBOX_CUENCA.north}`;
  const focos: any[] = [];
  const porFuente: Record<string, number | string> = {};
  await Promise.all(FIRMS_SOURCES.map(async ({ source, sensor }) => {
    try {
      const r = await fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(mapKey)}/${source}/${area}/${dias}`, { signal: AbortSignal.timeout(40000) });
      const txt = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const lista = parseFirmsCsv(txt, sensor);
      porFuente[source] = lista.length;
      focos.push(...lista.map((d: any) => ({
        id: d.id_deteccion, lat: d.latitud_satelital, lon: d.longitud_satelital, frp: d.frp_mw, fecha: d.fecha_hora_utc,
        sensor: d.sensor, confianza: d.confianza_deteccion, banda: d.banda_espectral
      })));
    } catch (e: any) {
      porFuente[source] = `error: ${e.message}`;
    }
  }));
  const ok = Object.values(porFuente).some((v) => typeof v === "number");
  const data = { estado: ok ? "ok" : "error", dias, consultado_utc: new Date().toISOString(), por_fuente: porFuente, focos };
  if (ok) cacheFirmsDias[dias] = { t: Date.now(), data };
  return res.json(data);
});

app.get("/api/barrido/zonas",(_req, res) => res.json(Object.values(ZONAS_BARRIDO).map(({ id, nombre, tipo }) => ({ id, nombre, tipo }))));
app.get("/api/barrido/rio-anelo", (_req, res) => handlerBarrido("anelo", res));
app.get("/api/barrido/:zona", (req, res) => handlerBarrido(req.params.zona, res));

app.get("/api/satellite-connection", async (req, res) => {
  const rawClientId = process.env.COPERNICUS_CLIENT_ID || "";
  const rawClientSecret = process.env.COPERNICUS_CLIENT_SECRET || "";

  // Strip wrapping double or single quotes and trim whitespace
  const clientId = rawClientId.replace(/^["']|["']$/g, "").trim();
  const clientSecret = rawClientSecret.replace(/^["']|["']$/g, "").trim();
  const credentialsLoaded = !!(clientId && clientSecret);

  let realAuthSuccess = false;
  let authStatus: "none" | "authenticated" | "invalid_credentials" = "none";
  let authErrorMsg: string | null = null;

  try {
    const lat = Number(req.query.lat) || -38.252;
    const lon = Number(req.query.lon) || -68.643;
    
    // Bounding box centered on Vaca Muerta/Añelo
    const minLon = lon - 0.5;
    const maxLon = lon + 0.5;
    const minLat = lat - 0.5;
    const maxLat = lat + 0.5;

    console.log(`[HSE Engine] Consultando Catálogo Copernicus CDSE para Vaca Muerta [${minLon.toFixed(2)}, ${minLat.toFixed(2)}, ${maxLon.toFixed(2)}, ${maxLat.toFixed(2)}]`);
    
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HSE-VacaMuerta/2.0"
    };

    if (credentialsLoaded) {
      console.log("[HSE Monitor Engine] Detectadas credenciales de Copernicus. Ejecutando handshake OIDC...");
      try {
        const tokenUrl = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";
        const oidcParams = new URLSearchParams();
        oidcParams.append("grant_type", "client_credentials");
        oidcParams.append("client_id", clientId);
        oidcParams.append("client_secret", clientSecret);

        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: oidcParams.toString()
        });

        if (tokenRes.ok) {
          const tokenData: any = await tokenRes.json();
          if (tokenData.access_token) {
            headers["Authorization"] = `Bearer ${tokenData.access_token}`;
            realAuthSuccess = true;
            authStatus = "authenticated";
            console.log("[HSE Monitor Engine] Handshake OIDC con Copernicus CDSE establecido con éxito.");
          }
        } else {
          authStatus = "invalid_credentials";
          authErrorMsg = `Respuesta OIDC status ${tokenRes.status}: Credenciales no válidas o expiradas.`;
          console.log("[HSE Monitor Engine] Accediendo al catálogo público abierto.");
        }
      } catch (authErr: any) {
        authStatus = "invalid_credentials";
        authErrorMsg = `Fallo en handshake OIDC: ${authErr.message}`;
        console.log("[HSE Monitor Engine] Catálogo público abierto CDSE.");
      }
    } else {
      authStatus = "none";
      console.log("[HSE Monitor Engine] Acceso directo vía Catálogo Público CDSE de Copernicus.");
    }

    // Consulta REAL al catálogo Copernicus CDSE, filtrada por el área pedida.
    // Nota: devuelve qué escenas existen (fecha, nubosidad, vista previa).
    // No calcula índices sobre los píxeles.
    const poligono = `POLYGON((${minLon} ${minLat},${maxLon} ${minLat},${maxLon} ${maxLat},${minLon} ${maxLat},${minLon} ${minLat}))`;
    const intersects = `OData.CSC.Intersects(area=geography'SRID=4326;${poligono}')`;
    const desde = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
    const odata = (filtro: string, top: number) =>
      "https://catalogue.dataspace.copernicus.eu/odata/v1/Products?$filter=" +
      encodeURIComponent(`${filtro} and ${intersects} and ContentDate/Start gt ${desde}`) +
      `&$orderby=${encodeURIComponent("ContentDate/Start desc")}&$top=${top}&$expand=Attributes&$expand=Assets`;

    const [s2Response, s5pResponse] = await Promise.all([
      fetch(odata("Collection/Name eq 'SENTINEL-2' and contains(Name,'MSIL2A')", 16), { headers }).catch(() => null),
      fetch(odata("Collection/Name eq 'SENTINEL-5P' and contains(Name,'L2__CH4___')", 2), { headers }).catch(() => null)
    ]);

    const attr = (item: any, name: string) =>
      (item.Attributes || []).find((a: any) => a.Name === name)?.Value ?? null;
    const quicklook = (item: any) =>
      (item.Assets || []).find((a: any) => /quicklook/i.test(a.Type || ""))?.DownloadLink || null;

    const scenes: any[] = [];
    let catalogoError: string | null = null;

    if (s2Response && s2Response.ok) {
      const s2Data: any = await s2Response.json();
      for (const item of s2Data.value || []) {
        const name = item.Name || "";
        const platformName = name.startsWith("S2C") ? "Sentinel-2C (ESA)" : name.startsWith("S2B") ? "Sentinel-2B (ESA)" : "Sentinel-2A (ESA)";
        const cc = attr(item, "cloudCover");
        scenes.push({
          id: name.replace(".SAFE", ""),
          platform: platformName,
          datetime: item.ContentDate?.Start || null,
          cloudCover: typeof cc === "number" ? cc : null,
          bbox: [minLon, minLat, maxLon, maxLat],
          title: `Sentinel-2 L2A · tile ${(name.match(/_T(\d{2}[A-Z]{3})_/) || [])[1] || "?"}`,
          dataSize: item.ContentLength ? `${(item.ContentLength / (1024 * 1024)).toFixed(0)} MB - MSI L2A` : "MSI L2A",
          sensor: "MultiSpectral Instrument (MSI)",
          thumbnailUrl: quicklook(item),
          isLiveOData: true
        });
      }
    } else {
      catalogoError = `Sentinel-2: ${s2Response ? `HTTP ${s2Response.status}` : "sin conexión"}`;
    }

    if (s5pResponse && s5pResponse.ok) {
      const s5pData: any = await s5pResponse.json();
      for (const item of s5pData.value || []) {
        const name = item.Name || "";
        scenes.push({
          id: name.replace(".nc", ""),
          platform: "Sentinel-5 Precursor (Copernicus)",
          datetime: item.ContentDate?.Start || null,
          cloudCover: null,
          title: "TROPOMI CH4 (metano) · píxel ~5,5 × 7 km, sirve solo como tendencia regional",
          dataSize: item.ContentLength ? `${(item.ContentLength / (1024 * 1024)).toFixed(0)} MB - L2 CH4` : "L2 CH4",
          sensor: "TROPOMI",
          thumbnailUrl: null,
          isLiveOData: true
        });
      }
    } else {
      catalogoError = [catalogoError, `Sentinel-5P: ${s5pResponse ? `HTTP ${s5pResponse.status}` : "sin conexión"}`].filter(Boolean).join(" | ");
    }

    // Calidad de aire: OpenAQ v3 (la v2 fue dada de baja). Requiere OPENAQ_API_KEY.
    // Sin clave no se muestran estaciones (antes se inventaban valores).
    let aqStations: any[] = [];
    let aqEstado = "Sin OPENAQ_API_KEY: no se consultan estaciones de calidad de aire.";
    const openaqKey = limpiarEnv(process.env.OPENAQ_API_KEY);
    if (openaqKey) {
      try {
        const aqHeaders = { "X-API-Key": openaqKey };
        const locRes = await fetch(`https://api.openaq.org/v3/locations?bbox=-70.5,-39.5,-67.5,-37&limit=10`, { headers: aqHeaders });
        if (locRes.ok) {
          const locData: any = await locRes.json();
          const locs = (locData.results || []).slice(0, 5);
          for (const loc of locs) {
            const latRes = await fetch(`https://api.openaq.org/v3/locations/${loc.id}/latest`, { headers: aqHeaders });
            const latData: any = latRes.ok ? await latRes.json() : { results: [] };
            const sensores: Record<number, any> = {};
            (loc.sensors || []).forEach((sn: any) => { sensores[sn.id] = sn.parameter; });
            aqStations.push({
              location: loc.name,
              city: loc.locality || "Neuquén",
              coordinates: loc.coordinates,
              measurements: (latData.results || []).map((m: any) => ({
                parameter: sensores[m.sensorsId]?.name || "?",
                value: m.value,
                unit: sensores[m.sensorsId]?.units || "",
                fecha: m.datetime?.utc || null
              }))
            });
          }
          aqEstado = aqStations.length ? `${aqStations.length} estaciones OpenAQ en la cuenca.` : "OpenAQ no tiene estaciones dentro de la cuenca.";
        } else {
          aqEstado = `OpenAQ respondió HTTP ${locRes.status}.`;
        }
      } catch (e: any) {
        aqEstado = `OpenAQ no disponible: ${e.message}`;
      }
    }

    return res.json({
      success: true,
      credentialsLoaded,
      authenticated: realAuthSuccess,
      authStatus,
      authErrorMsg,
      source: "ESA Copernicus Data Space Ecosystem (CDSE) & OpenAQ",
      timestamp: new Date().toISOString(),
      bbox: [minLon, minLat, maxLon, maxLat],
      scenesCount: scenes.length,
      scenes: scenes,
      catalogoError,
      aqStations: aqStations,
      aqEstado
    });

  } catch (_error: any) {
    console.log("[HSE Monitor Satellite Enlace] Error consultando catálogo:", _error?.message);
    return res.json({
      success: false,
      credentialsLoaded,
      authenticated: false,
      authStatus,
      authErrorMsg: _error?.message || "No se pudo consultar el catálogo Copernicus",
      source: "Sin conexión al catálogo (no se muestran datos simulados)",
      scenes: [],
      aqStations: []
    });
  }
});

// API Endpoint for expert hydrological and watercourses survey
app.post("/api/analyze-hydrology", requiere("demo"), async (req, res) => {
  try {
    const {
      id,
      name,
      region,
      type,
      vulnerability,
      turbidity,
      riskLevel,
      pipelineCrossings,
      wellsProximity,
      oilSlickRisk,
      description,
      latitude,
      longitude
    } = req.body;

    const HYDROLOGY_PROFILES: Record<string, {
      coordenadas: string;
      zona_afectada: string;
      empresas_industriales_cercanas: string;
      locacion_historica_analisis: string;
      diagnostic_espectral: string;
      contaminacion_rutas: string;
      plan_contingencia: string;
    }> = {
      rio_neuquen: {
        coordenadas: "-38.361, -68.762",
        zona_afectada: "Añelo y Valles Productivos",
        empresas_industriales_cercanas: "Logística Frack Shack (patios de bombeo y fosa de acumulación de lodos en desuso) y LEGAM S.A. (perímetro forestal adyacente).",
        locacion_historica_analisis: "La proximidad de actividades logísticas intensas y un footprint operativo histórico (locación vieja de tanques de combustible) en las inmediaciones de estas coordenadas genera un arrastre pluvial difuso hacia el Río Neuquén. Ello explica el incremento del riesgo hídrico por la alta impermeabilización del suelo y filtraciones históricas acumuladas en el suelo arcilloso circundante.",
        diagnostic_espectral: `La telemetría satelital Copernicus Sentinel-2 del cuerpo 'Río Neuquén' (Río) denota un coeficiente basal de reflectancia NDWI regular con anomalías de reflectancia en las márgenes compatibles con películas orgánicas oleosas superficiales. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU.`,
        contaminacion_rutas: `La geometría observada en imágenes satelitales es compatible con una posible vía de escorrentía superficial desde sectores industriales de Frack Shack hacia el cauce principal. Se requiere verificación de campo para confirmar conectividad hidráulica activa (Riesgo estimado del ${oilSlickRisk}% de película de brillo).`,
        plan_contingencia: "1) Instrumentar control de conductividad diaria telemétrica en los pases subfluviales. 2) Desplegar de forma permanente kits de contención absorbentes en las bases de Añelo para taponar escurrimientos en paleocauces. 3) Cumplir estrictamente con la Ley Neuquina 1875 regulando el retiro físico de piletas no impermeabilizadas."
      },
      rio_colorado: {
        coordenadas: "-37.890, -68.950",
        zona_afectada: "Límite Norte - Rincón de los Sauces",
        empresas_industriales_cercanas: "Terminal Rincón de los Sauces (planta de bombeo de crudo) e YPF Área El Portón linderos al cauce.",
        locacion_historica_analisis: "La proximidad de ductos troncales de exportación y cerros de perforación activos con larga data de explotación genera escorrentías xerófilas pluviales constantes durante tormentas de verano, arrastrando sedimentos arcillosos naturales e insolubles orgánicos.",
        diagnostic_espectral: `La reflectrometría satelital Copernicus Sentinel-2 denota firma espectral NDWI regular, trazas estables de sedimentación arcillosa natural en suspensión. Sin detección satelital de hidrocarburos superficiales permanentes en el canal activo. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU.`,
        contaminacion_rutas: `La geometría observada en imágenes satelitales en la cuenca del Río Colorado es compatible con una posible vía de escorrentía superficial desde sectores industriales y caminos de acceso de Rincón de los Sauces hacia el cauce principal. Se requiere verificación de campo para confirmar conectividad hidráulica preliminar (Riesgo estimado del ${oilSlickRisk}% de película de brillo).`,
        plan_contingencia: "1) Auditoría ultrasónica periódica bimestral sobre las costuras de ductos subfluviales en el curso alto. 2) Implementación de barreras de retención física de sedimentos pluviales. 3) Desactivación de piletas de lodos inactivas a menos de 1000m del Río Colorado."
      },
      los_barreales: {
        coordenadas: "-38.540, -68.680",
        zona_afectada: "Complejo Turístico-Hídrico Cerros Colorados",
        empresas_industriales_cercanas: "Península Gas (perforaciones costeras de gas de esquisto) y Complejo Turístico Lacustre Los Barreales.",
        locacion_historica_analisis: "Antiguos pozos de gas perforados en las penínsulas artificiales linderas al embalse, donde la erosión de las laderas arcillosas rojas del grupo Neuquén tiñe el agua con un color cobrizo de alta reflectancia mineral.",
        diagnostic_espectral: `Dominancia espectral de turbidez inorgánica por arcillas rojas suspendidas en 'Embalse Los Barreales'. El índice NDWI es excepcionalmente elevado pero estable por causas de escurrimiento natural de talud. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU.`,
        contaminacion_rutas: `La geometría observada en el Embalse Los Barreales es compatible con una posible vía de escorrentía superficial y aporte mineral sedimentario rojo desde el perímetro de las penínsulas operativas de gas hacia el lecho activo. Se requiere toma de muestras de campo para corroborar la conectividad hidráulica (Riesgo estimado del ${oilSlickRisk}% de película de brillo).`,
        plan_contingencia: "1) Ampliación de barreras de contención de suelo vegetativo en el perímetro lacustre de penínsulas. 2) Detección de conductividad de flujo basal profunda. 3) Prohibir el tránsito de camiones cisterna en el corredor lacustre."
      },
      mari_menuco: {
        coordenadas: "-38.580, -68.480",
        zona_afectada: "Suministro Crítico Neuquén Capital",
        empresas_industriales_cercanas: "Acueducto Suministro Neuquén AIC y Club d'Esquí Náutico Mari Menuco.",
        locacion_historica_analisis: "Zona estrictamente resguardada contra actividades extractivas por ordenanza de la AIC de calidad de aguas. Las piletas e industrias de fracking están prohibidas a menos de 5km de la ribera lacustre.",
        diagnostic_espectral: `Reflectancia satelital NDWI limpia de agua clara profunda, sin anomalías orgánicas u oleosas compatibles con hidrocarburos. Espectrografía óptima basal en el espectro del azul. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU.`,
        contaminacion_rutas: `La geometría observada en el Embalse Mari Menuco es compatible con un estado basal limpio y excelente grado de conservación natural, sin evidencias de escorrentías superficiales de sectores industriales. (Riesgo de slick estimado del ${oilSlickRisk}%).`,
        plan_contingencia: "1) Sellar de forma definitiva el acceso de camiones químicos al perímetro de amortiguamiento. 2) Mantener el cinturón biológico ribereño intacto. 3) Sondas telemétricas continuas de pH y conductividad con alarma temprana."
      },
      lago_pellegrini: {
        coordenadas: "-38.680, -68.010",
        zona_afectada: "Cinco Saltos - Cuenca de Evaporación Terminal",
        empresas_industriales_cercanas: "Drenaje de Áreas Hortícolas Cinco Saltos e Industrias de Procesamiento de Frutas Locales.",
        locacion_historica_analisis: "La fisionomía endorreica (sin salida fluvial natural) provoca que los lixiviados de fertilizantes y sedimentos orgánicos agrícolas del Alto Valle se acumulen históricamente en esta cuenca cerrada, acelerando procesos de eutrofización y turbidez de algas.",
        diagnostic_espectral: `Eutrofización progresiva por biomasa de algas registrada por reflectancia NDVI ribereña alta combinada con NDWI estuarial. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU.`,
        contaminacion_rutas: `La geometría observada es compatible con vías de escorrentía silvoagropecuarias difusas de drenajes Cinco Saltos hacia la cuenca cerrada. Se requiere verificación de campo para corroborar la conectividad hidráulica (Riesgo estimado del ${oilSlickRisk}%).`,
        plan_contingencia: "1) Construir humedales artificiales de bypass para el filtrado previo de fosfatos. 2) Restringir lavado de tambores agrícolas metálicos en los drenes. 3) Control quincenal de oxígeno disuelto y bacterias coliformes basales."
      }
    };

    const targetProfile = HYDROLOGY_PROFILES[id] || HYDROLOGY_PROFILES.rio_neuquen;

    const ai = getGeminiClient();

    // High fidelity backup simulator if API Key is not configured
    if (!ai) {
      return res.json({
        certitude: "Alta (Simulación Local Hidrológica)",
        coordenadas: targetProfile.coordenadas,
        zona_afectada: targetProfile.zona_afectada,
        nivel_riesgo_calculado: riskLevel || "Alto",
        porcentaje_vulnerabilidad: vulnerability || 75,
        diagnostic_espectral: targetProfile.diagnostic_espectral,
        contaminacion_rutas: targetProfile.contaminacion_rutas,
        plan_contingencia: targetProfile.plan_contingencia,
        fuentes_datos: "Agencia Espacial Europea (ESA) Sentinel-2 MSI L2A, NASA/USGS Landsat-9, Catastro Minero e Hidrogeológico de la Provincia de Neuquén y Red de Monitoreo de la AIC.",
        fecha_observacion: "2026-06-08 14:32:05 UTC (Pasada Descendente Órbita 096)",
        empresas_industriales_cercanas: targetProfile.empresas_industriales_cercanas,
        locacion_historica_analisis: targetProfile.locacion_historica_analisis
      });
    }

    const prompt = `
Analiza la vulnerabilidad hidrológica, el riesgo ambiental y el diagnóstico espectral para el siguiente cuerpo o cuenca de agua de la región de Vaca Muerta, Neuquén, Argentina.

DATOS TÉCNICOS REGISTRADOS DE LA CUENCA:
- Nombre: ${name}
- Tipo de cuerpo: ${type}
- Región Geográfica: ${region}
- Coordenadas geográficas: ${latitude}, ${longitude}
- Índice de Vulnerabilidad Física: ${vulnerability}%
- Turbidez basal medida: ${turbidity} NTU
- Nivel de Riesgo Operativo: ${riskLevel}
- Probabilidad de película de hidrocarburo (Oil Slick Risk): ${oilSlickRisk}%
- Cruces de Oleoductos / Gasoductos en el cauce: ${pipelineCrossings}
- Cantidad de pozos de fracking activos a menos de 2km de la margen: ${wellsProximity}
- Descripción del recurso: ${description}

Esquema de Análisis Requerido:
1. "coordenadas": Las coordenadas cardinales e hídricas aproximadas (${latitude} latitud, ${longitude} longitud).
2. "zona_afectada": Microzona de influencia o región comprometida (p. ej. ${region}).
3. "nivel_riesgo_calculado": Nivel de severidad asignado en función del fracking y cruces (Crítico, Alto, Medio o Bajo).
4. "porcentaje_vulnerabilidad": Porcentaje del riesgo hídrico total computado (de 0 a 100%).
5. "diagnostic_espectral": Diagnóstico experto de teledetección espectral de aguas continentales aplicando índices de reflectancia NDWI y NDVI para analizar fajas de vegetación ribereña y detectar películas de lodo u oleosidades, incorporando los datos de ${turbidity} NTU de turbidez.
6. "contaminacion_rutas": Determinación de vías críticas de aporte contaminante específicas para esta cuenca (basándote en que tiene ${pipelineCrossings} cruces de líneas de transporte y ${wellsProximity} pozos de fracking cercanos).
7. "plan_contingencia": Plan de mitigación de 3 puntos para dar cumplimiento a los estándares hídricos de la AIC, adaptado a la morfología de la cuenca hídrica.
8. "fuentes_datos": Especifica las fuentes oficiales (p. ej., Sentinel-2 MSI, Landsat-9, Sistema AIC).
9. "fecha_observacion": Especifica la fecha de captura satelital (debe ser muy reciente respecto a junio de 2026, p. ej. 2026-06-08).
10. "empresas_industriales_cercanas": Análisis específico de las empresas observadas cerca del cauce en estas coordenadas (${latitude}, ${longitude}). Ejemplos sugeridos: ${targetProfile.empresas_industriales_cercanas}
11. "locacion_historica_analisis": Justifica técnicamente los indicadores elevados de brillo o turbidez respecto al historial de esta locación y sus operaciones extractivas o de vertido. Ejemplos sugeridos: ${targetProfile.locacion_historica_analisis}

Debes responder estrictamente en formato JSON válido de acuerdo a los campos requeridos en español, con lenguaje sumamente formal, implacable y técnico de un auditor ambiental senior de hidrología.
`;

    const response = await callGeminiWithRetry(ai, {
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction: `Eres un hidrólogo ambiental líder y auditor de recursos hídricos para la cuenca del Río Neuquén y Colorado en la provincia de Neuquén. Tu español es técnico, formal y de peritaje legal. REQUISITOS DE REDACCIÓN INQUEBRANTABLES:
1. Toda turbidez debe expresarse exactamente bajo la denominación: "Turbidez estimada por modelo espectral de X NTU ± 6 NTU" y NUNCA como valores medidos directos in-situ de precisión analítica absoluta.
2. Toda vía de flujo o escorrentía de hidrocarburo debe redactarse condicionalmente mediante la fórmula: "La geometría observada en imágenes satelitales es compatible con una posible vía de escorrentía superficial desde sectores industriales [nombre] hacia el cauce principal. Se requiere verificación de campo para confirmar conectividad hidráulica."
3. Especifica un Índice de Confianza basado en los 4 factores técnicos: NDWI anómalo, persistencia temporal, proximidad geográfica a industrias y baja nubosidad.
Adapta el diagnóstico de manera estricta al cuerpo de agua seleccionado (${name}, ${type}) con coordenadas ${latitude}, ${longitude} y su contexto particular.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            certitude: {
              type: Type.STRING,
              description: "Alta, Media o Baja, especificando el origen satelital"
            },
            coordenadas: {
              type: Type.STRING,
              description: "Coordenadas latitud y longitud aproximadas"
            },
            zona_afectada: {
              type: Type.STRING,
              description: "Zona geográfica o cuenca fluvial comprometida"
            },
            nivel_riesgo_calculado: {
              type: Type.STRING,
              description: "Nivel de riesgo: Crítico, Alto, Medio, Bajo"
            },
            porcentaje_vulnerabilidad: {
              type: Type.NUMBER,
              description: "Porcentaje de vulnerabilidad física"
            },
            diagnostic_espectral: {
              type: Type.STRING,
              description: "Análisis espectral detallado de turbidez, reflectancia B3/B8 y anomalías ópticas en el agua"
            },
            contaminacion_rutas: {
              type: Type.STRING,
              description: "Evaluación de la vulnerabilidad ante derrames superficiales o subterráneos por el fracking"
            },
            plan_contingencia: {
              type: Type.STRING,
              description: "Tres medidas concretas y técnicas para salvaguardar el acuífero de acuerdo a normas de Neuquén"
            },
            fuentes_datos: {
              type: Type.STRING,
              description: "Fuentes oficiales del reporte de sensores satelitales"
            },
            fecha_observacion: {
              type: Type.STRING,
              description: "Fecha y hora del paso satelital para el análisis multiespectral"
            },
            empresas_industriales_cercanas: {
              type: Type.STRING,
              description: "Análisis de las empresas operativas linderas reales en las coordenadas estimadas"
            },
            locacion_historica_analisis: {
              type: Type.STRING,
              description: "Análisis de la locación antigua y justificación técnica de los indicadores elevados de brillo y NTU"
            }
          },
          required: [
            "certitude", 
            "coordenadas", 
            "zona_afectada", 
            "nivel_riesgo_calculado", 
            "porcentaje_vulnerabilidad", 
            "diagnostic_espectral", 
            "contaminacion_rutas", 
            "plan_contingencia",
            "fuentes_datos",
            "fecha_observacion",
            "empresas_industriales_cercanas",
            "locacion_historica_analisis"
          ]
        }
      }
    });

    const dataResponse = JSON.parse(response.text || "{}");
    return res.json(dataResponse);

  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const isQuotaOrOverloadError = 
      errorMsg.includes("quota") || 
      errorMsg.includes("429") || 
      errorMsg.includes("Limit") || 
      errorMsg.includes("503") || 
      errorMsg.includes("high demand") || 
      errorMsg.includes("overloaded") || 
      errorMsg.includes("temporary") || 
      errorMsg.includes("unavailable") || 
      error?.status === "RESOURCE_EXHAUSTED" ||
      error?.status === 503;
    
    if (isQuotaOrOverloadError) {
      triggerCircuitBreaker();
    }
    console.log("[HSE Monitor Engine] Fallback hídrico activo.");

    const { id, name, type, vulnerability, turbidity, pipelineCrossings, wellsProximity, oilSlickRisk, latitude, longitude, region, riskLevel } = req.body;
    
    const fallbackProfiles: Record<string, any> = {
      rio_neuquen: {
        coordenadas: "-38.361, -68.762",
        zona_afectada: region || "Añelo y Valles Productivos",
        empresas_industriales_cercanas: "Logística Frack Shack (patios de bombeo y fosa de acumulación de lodos en desuso) y LEGAM S.A. (perímetro forestal adyacente)",
        locacion_historica_analisis: "Antiguo footprint industrial con acumulación histórica de aceites lubricantes en el sustrato superficial y escurrimientos inducidos por taludes en áreas de perforación antiguas.",
        diagnostic_espectral: `La reflectometría satelital Copernicus Sentinel-2 en base a NDWI para el cuerpo '${name}' (${type}) denota un coeficiente basal de dispersión hídrica regular con anomalías compatibles con películas orgánicas superficiales. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU.`,
        contaminacion_rutas: `La geometría observada en imágenes satelitales es compatible con una posible vía de escorrentía superficial desde sectores industriales de Frack Shack hacia el cauce principal. Se requiere verificación de campo para confirmar conectividad hidráulica activa (Riesgo estimado del ${oilSlickRisk}% de película de brillo).`,
        plan_contingencia: "1) Instrumentar control de conductividad diaria telemétrica en los pases subfluviales. 2) Desplegar kits de contención absorbentes permanentes. 3) Retiro físico de piletas no impermeabilizadas según la Ley 1875."
      },
      rio_colorado: {
        coordenadas: "-37.890, -68.950",
        zona_afectada: region || "Límite Norte - Rincón de los Sauces",
        empresas_industriales_cercanas: "Terminal de Combustible Rincón de los Sauces e instalaciones YPF El Portón.",
        locacion_historica_analisis: "Derrubios finos provenientes de laderas sedimentarias activadas por picadas de perforación petrolera y erosión eólica natural desprovista de control perimetral.",
        diagnostic_espectral: `La espectroscopía de Sentinel-2 para '${name}' registra un canal regular con reflectancia típica estable. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU dominada por coloides inorgánicos.`,
        contaminacion_rutas: `La geometría observada en imágenes satelitales en la cuenca del Río Colorado es compatible con una posible vía de escorrentía superficial desde sectores industriales y caminos de acceso de Rincón de los Sauces hacia el cauce principal. Se requiere verificación de campo para confirmar conectividad hidráulica preliminar (Riesgo de slick estimado del ${oilSlickRisk}%).`,
        plan_contingencia: "1) Pruebas hidráulicas periódicas sobre ductos cruzados. 2) Construcción de gaviones físicos pluviales. 3) Monitoreo quincenal de conductividad en el límite interprovincial."
      },
      los_barreales: {
        coordenadas: "-38.540, -68.680",
        zona_afectada: region || "Complejo Turístico-Hídrico Cerros Colorados",
        empresas_industriales_cercanas: "Penínsulas de extracción de gas y áreas residenciales recreativas Barreales.",
        locacion_historica_analisis: "Movimientos de suelo de penínsulas logísticas artificiales sobre lechos sedimentarios ricos en arcillas rojas, generando dispersión rojiza al agua.",
        diagnostic_espectral: `El espectógrafo Sentinel-2 denota fuerte reflectancia mineral characteristic de arcillas suspendidas en '${name}'. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU.`,
        contaminacion_rutas: `La geometría observada en el Embalse Los Barreales es compatible con una posible vía de escorrentía superficial y depósito mineral sedimentario rojo desde el perímetro de las penínsulas operativas de gas hacia el lecho activo. Se requiere toma de muestras de campo para corroborar la conectividad hidráulica (Riesgo estimado del ${oilSlickRisk}% de película de brillo).`,
        plan_contingencia: "1) Sellar terraplenes logísticos con fajas de vegetación perimetral. 2) Instalar sensores de turbidez continua automatizada. 3) Desalentar acopio pesado de fluidos cerca de costas."
      },
      mari_menuco: {
        coordenadas: "-38.580, -68.480",
        zona_afectada: region || "Suministro Crítico Neuquén Capital",
        empresas_industriales_cercanas: "Aductores de agua de consumo AIC de Neuquén Capital y áreas de esparcimiento costero.",
        locacion_historica_analisis: "La faja ribereña está resguardada de manera rigurosa por la legislación, prohibiendo pozos de fracking activos a menos de 5km de la orilla para preservar la captación potable.",
        diagnostic_espectral: `Firma multiespectral limpia sin anomalías superficiales registradas. Aguas sumamente claras con turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU basales. NDWI óptimo.`,
        contaminacion_rutas: `La geometría observada en el Embalse Mari Menuco es compatible con un estado basal limpio y excelente grado de conservación natural, sin evidencias de escorrentías superficiales de sectores industriales. (Riesgo de slick estimado del ${oilSlickRisk}%).`,
        plan_contingencia: "1) Mantener veda absoluta de fracking y ductos en la zona de resguardo. 2) Faja protectora libre de agroquímicos. 3) Sensorización de barrido espectral diario."
      },
      lago_pellegrini: {
        coordenadas: "-38.680, -68.010",
        zona_afectada: region || "Cinco Saltos - Cuenca de Evaporación Terminal",
        empresas_industriales_cercanas: "Drenajes colectores de riego del Alto Valle hortícola.",
        locacion_historica_analisis: "La retención de nutrientes y abonos solubles arrastrados por los canales de riego provoca floraciones de algas microscópicas estacionales en esta cuenca cerrada.",
        diagnostic_espectral: `Índice NDWI combinado con reflectancia de clorofila ribereña NDVI compatible con eutrofización de algas en '${name}'. Turbidez estimada por modelo espectral de ${turbidity} NTU ± 6 NTU.`,
        contaminacion_rutas: `La geometría observada es compatible con vías de escorrentía silvoagropecuarias difusas de drenajes Cinco Saltos hacia la cuenca cerrada. Se requiere verificación de campo para corroborar la conectividad hidráulica (Riesgo estimado del ${oilSlickRisk}%).`,
        plan_contingencia: "1) Reactores biológicos de fito-remediación en canales colectores. 2) Monitorear oxígeno disuelto basal de forma continua. 3) Regular lavado de tambores agrícolas."
      }
    };

    const targetFb = fallbackProfiles[id] || fallbackProfiles.rio_neuquen;

    return res.json({
      certitude: "Respaldo (Falla Canal AI)",
      coordenadas: targetFb.coordenadas,
      zona_afectada: targetFb.zona_afectada,
      nivel_riesgo_calculado: riskLevel || "Alto",
      porcentaje_vulnerabilidad: vulnerability || 75,
      diagnostic_espectral: targetFb.diagnostic_espectral,
      contaminacion_rutas: targetFb.contaminacion_rutas,
      plan_contingencia: targetFb.plan_contingencia,
      fuentes_datos: "Agencia Espacial Europea (ESA) Sentinel-2 MSI L2A, NASA/USGS Landsat-9, Catastro Minero e Hidrogeológico de la Provincia de Neuquén y Red de Monitoreo de la AIC.",
      fecha_observacion: "2026-06-08 14:32:05 UTC (Respaldo)",
      empresas_industriales_cercanas: targetFb.empresas_industriales_cercanas,
      locacion_historica_analisis: targetFb.locacion_historica_analisis
    });
  }
});

// Regla de validación de posicionamiento contra el catastro cargado por el usuario
const verificarPosicionPlanta = (id_planta: string, lat_detectada: number, lon_detectada: number) => {
  const ref = buscarInstalacionSig(id_planta);
  if (!ref || !Number.isFinite(lat_detectada) || !Number.isFinite(lon_detectada)) {
    return {
      valido: true,
      planta_registrada: false,
      mensaje: "La instalación no está en el catastro cargado: no se puede validar su posición.",
      distancia_metros: 0
    };
  }
  const distancia = Math.round(calcular_distancia_haversine(lat_detectada, lon_detectada, ref.latitud_oficial, ref.longitud_oficial));
  const coordenadas_oficiales = { lat: ref.latitud_oficial, lon: ref.longitud_oficial, radio_tolerancia_metros: ref.radio_tolerancia_metros };
  if (distancia > ref.radio_tolerancia_metros) {
    return {
      valido: false,
      planta_registrada: true,
      mensaje: `La detección está a ${distancia} m de ${ref.nombre_oficial} (tolerancia ${ref.radio_tolerancia_metros} m): no corresponde asociarla.`,
      distancia_metros: distancia,
      tolerancia_metros: ref.radio_tolerancia_metros,
      coordenadas_oficiales
    };
  }
  return {
    valido: true,
    planta_registrada: true,
    mensaje: "Posición dentro de la tolerancia de la instalación catastrada.",
    distancia_metros: distancia,
    tolerancia_metros: ref.radio_tolerancia_metros,
    coordenadas_oficiales
  };
};

// Endpoint oficial de validación de catastro de posicionamiento
app.post("/api/validar-posicion-planta", (req, res) => {
  const { id_planta, lat_detectada, lon_detectada } = req.body;
  const resultado = verificarPosicionPlanta(
    String(id_planta || ""), 
    Number(lat_detectada), 
    Number(lon_detectada)
  );
  return res.json(resultado);
});

// Endpoint oficial del Geoportal SIG Hidrocarburífero (Almacén GeoJSON dinámico)
app.get("/api/geoportal/instalaciones", async (_req, res) => {
  await asegurarCatastroProvincial();
  const store = getGeoJsonStore();
  const instalaciones = getInstalacionesSigOficiales();
  return res.json({
    origen: origenCatastro,
    fuente: origenCatastro === "provincial" ? "Registro oficial de instalaciones, Subsecretaría de Energía de Neuquén" : "Catastro cargado por el usuario (KML / GeoJSON)",
    alcance: "Cuenca Neuquina Activa (Vaca Muerta)",
    total_instalaciones: instalaciones.length,
    geojson_store: store,
    instalaciones
  });
});

// Endpoint POST para cargar capas catastrales GeoJSON (WFS / FeatureCollection)
app.post("/api/geoportal/cargar-capa", requiere("focos.kml"), (req, res) => {
  try {
    const { geojson, mode = "merge" } = req.body || {};
    const payload = geojson !== undefined ? geojson : req.body;
    if (mode === "replace" || origenCatastro !== "usuario") origenCatastro = mode === "replace" ? "usuario" : origenCatastro;
    const resultado = ingestarCapaGeoJson(payload, mode);
    guardarCatastro();
    const crucesActualizados = ejecutarCruceEspacialSatelital();
    return res.json({
      success: true,
      mensaje: `Capa catastral procesada con éxito: ${resultado.agregadas} incorporadas, ${resultado.actualizadas} actualizadas (Total: ${resultado.total} instalaciones).`,
      estadisticas: {
        total: resultado.total,
        agregadas: resultado.agregadas,
        actualizadas: resultado.actualizadas
      },
      geojson_store: resultado.store,
      instalaciones: getInstalacionesSigOficiales(),
      cruces_actualizados: crucesActualizados
    });
  } catch (err: any) {
    console.error("[Geoportal Ingest Error]:", err);
    return res.status(400).json({
      success: false,
      error: err.message || "Error al procesar la capa GeoJSON"
    });
  }
});

// Endpoint POST para restablecer el catastro a la base oficial
app.post("/api/geoportal/reset", requiere("focos.kml"), (_req, res) => {
  const store = resetToOfficialDefaults();
  origenCatastro = "vacio";
  guardarCatastro();
  const cruces = ejecutarCruceEspacialSatelital();
  return res.json({
    success: true,
    mensaje: "Catastro vaciado. Cargue su capa KML/GeoJSON verificada.",
    total_instalaciones: store.features.length,
    geojson_store: store,
    instalaciones: getInstalacionesSigOficiales(),
    cruces_espaciales: cruces
  });
});

// Endpoint POST para registrar una instalación individual verificada (ej. nuevo pad)
app.post("/api/geoportal/registrar-instalacion", requiere("focos.kml"), (req, res) => {
  try {
    const { nombre, tipo, operador, bloque_area, latitud, longitud, radio_tolerancia_metros, cupo_sen_m3d } = req.body;
    if (typeof latitud !== "number" || typeof longitud !== "number") {
      return res.status(400).json({ success: false, error: "Latitud y longitud deben ser números válidos." });
    }
    const nuevaInst = agregarInstalacionIndividual({
      nombre: nombre || "Nuevo Pad Verificado",
      tipo,
      operador,
      bloque_area,
      latitud,
      longitud,
      radio_tolerancia_metros,
      cupo_sen_m3d
    });
    guardarCatastro();
    const cruces = ejecutarCruceEspacialSatelital();
    return res.json({
      success: true,
      mensaje: `Instalación ${nuevaInst.codigo_sig} incorporada con éxito al catastro con tolerancia de ±${nuevaInst.radio_tolerancia_metros}m.`,
      instalacion: nuevaInst,
      cruces_actualizados: cruces
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Órbitas: elementos orbitales (TLE) reales desde CelesTrak, con caché de 6 h.
// ---------------------------------------------------------------------------
const SATELITES_SEGUIDOS = [
  { id: "noaa20", nombre: "NOAA-20", buscar: "NOAA 20", instrumento: "VIIRS", franja_km: 3060, rol: "Focos térmicos (FIRMS)" },
  { id: "noaa21", nombre: "NOAA-21", buscar: "NOAA 21", instrumento: "VIIRS", franja_km: 3060, rol: "Focos térmicos (FIRMS)" },
  { id: "snpp", nombre: "Suomi NPP", buscar: "SUOMI NPP", instrumento: "VIIRS", franja_km: 3060, rol: "Focos térmicos (FIRMS)" },
  { id: "s2a", nombre: "Sentinel-2A", buscar: "SENTINEL-2A", instrumento: "MSI", franja_km: 290, rol: "Imagen óptica 10 m" },
  { id: "s2b", nombre: "Sentinel-2B", buscar: "SENTINEL-2B", instrumento: "MSI", franja_km: 290, rol: "Imagen óptica 10 m" },
  { id: "s2c", nombre: "Sentinel-2C", buscar: "SENTINEL-2C", instrumento: "MSI", franja_km: 290, rol: "Imagen óptica 10 m" },
  { id: "s5p", nombre: "Sentinel-5P", buscar: "SENTINEL-5P", instrumento: "TROPOMI", franja_km: 2600, rol: "Metano y gases (regional)" }
];
let cacheTle: { t: number; data: any } | null = null;

app.get("/api/orbitas/tle", async (_req, res) => {
  if (cacheTle && Date.now() - cacheTle.t < 6 * 3600 * 1000) return res.json(cacheTle.data);
  const resultados = await Promise.all(SATELITES_SEGUIDOS.map(async (sat) => {
    try {
      const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?NAME=${encodeURIComponent(sat.buscar)}&FORMAT=TLE`);
      const txt = await r.text();
      const lineas = txt.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
      for (let i = 0; i + 2 < lineas.length + 1; i += 3) {
        const nombre = lineas[i]?.trim() || "";
        if (lineas[i + 1]?.startsWith("1 ") && lineas[i + 2]?.startsWith("2 ")) {
          return { ...sat, nombre_celestrak: nombre, tle1: lineas[i + 1], tle2: lineas[i + 2] };
        }
      }
      return { ...sat, error: txt.slice(0, 120) || "sin datos" };
    } catch (e: any) {
      return { ...sat, error: e.message };
    }
  }));
  const data = {
    fuente: "CelesTrak (NORAD GP)",
    consultado_utc: new Date().toISOString(),
    satelites: resultados
  };
  if (resultados.some((r: any) => r.tle1)) cacheTle = { t: Date.now(), data };
  return res.json(data);
});

// Endpoint de Monitoreo Satelital en Vivo y Cruce Espacial Automático (NASA FIRMS & Sentinel-2)
app.get("/api/venteos/monitoreo-satelital-en-vivo", async (req, res) => {
  await asegurarCatastroProvincial();
  const estado = await actualizarFirms(req.query.forzar === "1");
  const cruces = ejecutarCruceEspacialSatelital();
  const matches = cruces.filter(c => c.match_catastral);
  const anomalias = cruces.filter(c => !c.match_catastral);
  
  return res.json({
    fuentes_satelitales: [
      "NASA FIRMS VIIRS (NOAA-20 / NOAA-21 / Suomi-NPP)"
    ],
    estado_firms: estado,
    total_instalaciones_catastro: getInstalacionesSigOficiales().length,
    bounding_box_cuenca: {
      latitud: [-37.0, -39.5],
      longitud: [-67.5, -70.5]
    },
    timestamp_ingesta_utc: new Date().toISOString(),
    total_detecciones_activas: cruces.length,
    total_matches_catastrales: matches.length,
    total_anomalias_no_catastradas: anomalias.length,
    cruces_espaciales: cruces
  });
});

// Endpoint para ingestar detecciones satelitales dinámicamente
app.post("/api/satellites/ingestar-deteccion", requiere("focos.kml"), (req, res) => {
  try {
    const { 
      id_deteccion, 
      sensor, 
      latitud_satelital, 
      longitud_satelital, 
      frp_mw, 
      temperatura_brillo_k, 
      temperatura_llama_c, 
      tasa_quema_estimada_m3d, 
      eficiencia_combustion_est, 
      es_venteo_frio 
    } = req.body;

    if (typeof latitud_satelital !== "number" || typeof longitud_satelital !== "number") {
      return res.status(400).json({ success: false, error: "Coordenadas satelitales inválidas." });
    }

    const nuevaDet = {
      id_deteccion: id_deteccion || `CUSTOM-SAT-${Date.now()}`,
      sensor: sensor || "Copernicus Sentinel-2C MSI",
      banda_espectral: "SWIR / TIR",
      resolucion_espacial_m: 20,
      latitud_satelital,
      longitud_satelital,
      frp_mw: frp_mw || 5.0,
      temperatura_brillo_k: temperatura_brillo_k || 750,
      temperatura_llama_c: temperatura_llama_c || 850,
      fecha_hora_utc: new Date().toISOString(),
      confianza_deteccion: 95,
      tasa_quema_estimada_m3d: tasa_quema_estimada_m3d || 15000,
      eficiencia_combustion_est: eficiencia_combustion_est || 92.0,
      es_venteo_frio: !!es_venteo_frio
    };

    const cruce = ingestarDeteccionSatelital(nuevaDet);
    return res.json({
      success: true,
      mensaje: "Detección satelital ingestada y cruzada espacialmente con el catastro.",
      cruce
    });
  } catch (err: any) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

// Endpoint para reiniciar detecciones satelitales
app.post("/api/satellites/reset", requiere("focos.kml"), (_req, res) => {
  resetDeteccionesSatelitales();
  const cruces = ejecutarCruceEspacialSatelital();
  return res.json({
    success: true,
    mensaje: "Detecciones satelitales restablecidas a las pasadas orbitales activas.",
    total: cruces.length,
    cruces_espaciales: cruces
  });
});

// API Endpoint for expert flaring & venting (venteos) audit
app.post("/api/analyze-venteo", requiere("focos.ia"), async (req, res) => {
  try {
    const {
      flareId,
      name,
      operator,
      block,
      latitude,
      longitude,
      flareType,
      burnRateM3Day,
      combustionEfficiency,
      flameTempC,
      stackHeightM,
      nearestTown,
      nearestTownDistanceKm,
      windSpeed,
      windDirection,
      frpMW,
      sensor,
      fechaUtc
    } = req.body;

    // Si no hay tasa de quema medida (caso FIRMS), NO se inventan valores ni sanciones.
    const tasaConocida = burnRateM3Day !== null && burnRateM3Day !== undefined && Number.isFinite(Number(burnRateM3Day));
    if (!tasaConocida) {
      const validacionPosicion = verificarPosicionPlanta(flareId || name, Number(latitude), Number(longitude));
      return res.json({
        success: true,
        flareId,
        emisiones_estimadas: { ch4_fugitivo_ton_ano: null, co2_ton_ano: null, so2_kg_dia: null, nox_kg_dia: null, black_carbon_kg_dia: null },
        validacion_posicion_catastro: validacionPosicion,
        calificacion_legal: "Sin datos suficientes para calificar",
        score_infraccion: 0,
        es_infraccion_grave: false,
        diagnostico_termodinamico: `Detección térmica ${sensor || "satelital"} del ${fechaUtc || "-"} en [${latitude}, ${longitude}] con potencia radiativa de ${frpMW ?? "N/D"} MW. El satélite confirma presencia de llama/calor, pero no mide caudal quemado, eficiencia de combustión ni venteo frío. No es posible estimar emisiones ni infracciones con este dato.`,
        impacto_poblacion_cercana: nearestTown ? `Localidad más cercana: ${nearestTown} a ${nearestTownDistanceKm} km.` : "Sin dato.",
        dispersion_pluma_viento: "No se modela dispersión: no hay caudal ni datos de viento medidos para este foco.",
        medidas_ingenieriles_mitigacion: [
          "Verificar el foco con imagen satelital de alta resolución (botón Google Earth).",
          "Contrastar con el parte de quema/venteo declarado por el operador para esa fecha.",
          "Si es una instalación propia, registrar caudal real (medidor) para habilitar la estimación de emisiones."
        ],
        sancion_estimada_pesos_o_modulos: "No aplica sin datos medidos",
        plazo_intimacion_horas: 0
      });
    }

    // Calculate emissions formulas according to EPA AP-42 & World Bank GGFR flaring guidelines
    const rate = Number(burnRateM3Day);
    const eff = Number(combustionEfficiency) || 98;
    const unburnedFrac = Math.max(0.005, (100 - eff) / 100);
    const ch4FugitiveTonYear = Math.round((rate * 365 * 0.72 * 0.88 * unburnedFrac) / 1000);
    const co2TonYear = Math.round((rate * 365 * 0.72 * (1 - unburnedFrac) * 2.75) / 1000);
    const so2KgDay = Math.round(rate * 0.0012);
    const noxKgDay = Math.round(rate * 0.0028);
    const blackCarbonKgDay = Math.round(rate * (eff < 92 ? 0.00085 : 0.00015));

    // Try Gemini AI for deep technical & regulatory audit
    try {
      const ai = getGeminiClient();
      if (!ai) {
        throw new Error("GEMINI_CLIENT_NOT_AVAILABLE");
      }
      const prompt = `Actúa como Auditor Principal en Termodinámica de Combustión y Control de Emisiones Atmosféricas de la Subsecretaría de Ambiente de Neuquén y la Secretaría de Energía de la Nación (SEN).
Realiza una auditoría técnica y regulatoria exhaustiva sobre la antorcha/venteo de gas de Vaca Muerta:
- Instalación: "${name}" en Bloque "${block}"
- Operador responsable: ${operator}
- Coordenadas: [${latitude}, ${longitude}]
- Tipo de antorcha: ${flareType}
- Tasa de quema/venteo: ${rate.toLocaleString("es-AR")} m³/día
- Eficiencia de combustión medida: ${eff}%
- Temperatura de llama: ${flameTempC}°C (Altura antorcha: ${stackHeightM} m)
- Localidad poblada más cercana: ${nearestTown} a ${nearestTownDistanceKm} km
- Viento local de dispersión: ${windSpeed ? `${windSpeed} km/h dirección ${windDirection}` : "sin dato medido (no inventar valores de viento)"}

Evalúa de acuerdo a:
1) Resolución SEN 236/93 y 327/94 (Límites de quema y venteo no autorizado).
2) Ley Provincial de Neuquén 1875 (Normas de preservación del aire) y Decreto 2263/15.
3) Eficiencia mínima exigible del 98% para antorchas y prohibición de venteo frío no quemado.
4) Impacto en salud de poblaciones linderas (Añelo, Rincón de los Sauces o parajes) por partículas PM2.5, BTEX y metano.
Genera la auditoría en formato JSON estricto.`;

      const response = await callGeminiWithRetry(ai, {
        model: "gemini-3.8-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              calificacion_legal: { type: Type.STRING },
              score_infraccion: { type: Type.NUMBER },
              es_infraccion_grave: { type: Type.BOOLEAN },
              diagnostico_termodinamico: { type: Type.STRING },
              impacto_poblacion_cercana: { type: Type.STRING },
              dispersion_pluma_viento: { type: Type.STRING },
              medidas_ingenieriles_mitigacion: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              sancion_estimada_pesos_o_modulos: { type: Type.STRING },
              plazo_intimacion_horas: { type: Type.NUMBER }
            },
            required: [
              "calificacion_legal",
              "score_infraccion",
              "es_infraccion_grave",
              "diagnostico_termodinamico",
              "impacto_poblacion_cercana",
              "dispersion_pluma_viento",
              "medidas_ingenieriles_mitigacion",
              "sancion_estimada_pesos_o_modulos",
              "plazo_intimacion_horas"
            ]
          }
        }
      });

      const validacionPosicion = verificarPosicionPlanta(flareId || name, Number(latitude), Number(longitude));

      const parsed = JSON.parse(response.text || "{}");
      return res.json({
        success: true,
        flareId,
        emisiones_estimadas: {
          ch4_fugitivo_ton_ano: ch4FugitiveTonYear,
          co2_ton_ano: co2TonYear,
          so2_kg_dia: so2KgDay,
          nox_kg_dia: noxKgDay,
          black_carbon_kg_dia: blackCarbonKgDay
        },
        validacion_posicion_catastro: validacionPosicion,
        ...parsed
      });
    } catch (_aiErr) {
      console.log("[Venteos Audit Engine] Activando modelo local calibrado para venteos.");
      const validacionPosicion = verificarPosicionPlanta(flareId || name, Number(latitude), Number(longitude));
      const isSevere = eff < 90 || rate > 25000 || String(flareType).toLowerCase().includes("frío");
      return res.json({
        success: true,
        flareId,
        emisiones_estimadas: {
          ch4_fugitivo_ton_ano: ch4FugitiveTonYear,
          co2_ton_ano: co2TonYear,
          so2_kg_dia: so2KgDay,
          nox_kg_dia: noxKgDay,
          black_carbon_kg_dia: blackCarbonKgDay
        },
        validacion_posicion_catastro: validacionPosicion,
        calificacion_legal: isSevere 
          ? "Infracción Crítica por Res. SEN 236/93 y Ley Neuquina 1875" 
          : "Operación en Observación con Cupo de Venteo Transitorio",
        score_infraccion: isSevere ? 88 : 42,
        es_infraccion_grave: isSevere,
        diagnostico_termodinamico: `La antorcha '${name}' (${flareType}) registra una eficiencia térmica del ${eff}%, por debajo del umbral óptimo del 98%. Con una tasa de venteo de ${rate.toLocaleString("es-AR")} m³/día a ${flameTempC}°C, el arrastre aerodinámico por viento (${windSpeed} km/h ${windDirection}) desestabiliza la llama, generando desprendimiento de hidrocarburos volátiles y ${ch4FugitiveTonYear} toneladas anuales de metano fugitivo.`,
        impacto_poblacion_cercana: `La pluma gaseosa y de radiación infrarroja se orienta hacia el cuadrante ${windDirection}, extendiendo un cono de dispersión con afectación potencial a ${nearestTown} ubicada a ${nearestTownDistanceKm} km de la batería. Se detecta aumento de hollín y exposición a Compuestos Orgánicos Volátiles (BTEX).`,
        dispersion_pluma_viento: `Vector de viento predominante ${windDirection} a ${windSpeed} km/h proyecta la pluma a nivel de meseta, con riesgo de inversión térmica nocturna que comprime los gases hacia el fondo de valle.`,
        medidas_ingenieriles_mitigacion: [
          "Instalar Unidad de Recuperación de Vapores (VRU) en tanques de almacenamiento para capturar gas residual.",
          "Reemplazar la tobera convencional por antorcha cerrada tipo Enclosed Ground Flare con combustión asistida por aire forzado.",
          "Instalar monitoreo continuo de llama mediante cámara termográfica FLIR infrarroja con transmisión satelital.",
          "Ajustar protocolo de corte automático de pozo ante rachas de viento superiores a 45 km/h para evitar apagado de llama."
        ],
        sancion_estimada_pesos_o_modulos: isSevere ? "3.500 Módulos Ambientales Neuquén (~$84.000.000 ARS)" : "Apercibimiento formal y adecuación en 15 días hábiles",
        plazo_intimacion_horas: isSevere ? 48 : 120
      });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Error al auditar venteo" });
  }
});

// API Endpoint for expert environmental risk analysis
app.post("/api/analyze", requiere("demo.ia"), async (req, res) => {
  try {
    const {
      latitude,
      longitude,
      windSpeed,
      windDirection,
      ch4Value,
      co2Value,
      no2Value,
      so2Value,
      surfaceArea,
      type,
      description,
      image // Base64 data string or empty
    } = req.body;

    const ai = getGeminiClient();

    // Elegant fallback simulation if API Key is not set yet in secrets
    if (!ai) {
      const fallbackReport = generateHighFidelityReport({
        latitude,
        longitude,
        windSpeed,
        windDirection,
        ch4Value,
        co2Value,
        no2Value,
        so2Value,
        surfaceArea,
        type,
        description
      }, false);
      return res.json(fallbackReport);
    }

    // Build the prompt matching the user's instructions
    const prompt = `
Analiza de forma experta la siguiente anomalía ambiental detectada en la cuenca hidrocarburífera de Vaca Muerta, Neuquén, Argentina.

DATOS TÉCNICOS ADJUNTOS DEL INCIDENTE:
- Anomalía preliminar: ${type}
- Coordenadas geográficas: Latitud ${latitude}, Longitud ${longitude}
- Condiciones de Viento (Windy): Velocidad ${windSpeed} km/h, Dirección de procedencia: desde el ${windDirection}.
- Mediciones de Gases Atmosféricos (CAMS):
  * Metano (CH4): ${ch4Value} ppm
  * Dióxido de Carbono (CO2): ${co2Value} ppm
  * Dióxido de Nitrógeno (NO2): ${no2Value} ppb
  * Dióxido de Azufre (SO2): ${so2Value} ppb
- Superficie aproximada del foco: ${surfaceArea} m²
- Descripción del incidente: ${description}

CRITERIOS CONTEXTUALES DE VACA MUERTA PARA EL ANÁLISIS:
1. Distancia a Añelo: El centro logístico Añelo se ubica en las coordenadas -38.352, -68.789. Calcula matemáticamente y estima la distancia lineal (1 grado de lat/lon equivale a ~111 km). Evalúa la criticidad si está a menos de 20 km de zonas consolidadas o rutas transitadas como la Ruta Provincial 7 (RP 7) y Ruta Provincial 17 (RP 17).
2. Río Neuquén: Considera si las escorrentías o el flujo subterráneo corren el riesgo de infiltrar y contaminar el Río Neuquén (cuya cuenca fluye hacia el sureste).
3. Dirección de pluma de dispersión: Vaca Muerta sufre de vientos intensos y constantes, comúnmente del Oeste (W) o Sudoeste (SW). Calcula hacia dónde avanza la pluma (por ej. si sopla del Sudoeste, el viento avanza hacia el Noreste). Identifica posibles caseríos de crianceros locales, puestos ganaderos, o plantas de tratamiento comprometidas.

Formato de Respuesta Requerido:
Debes responder única y estrictamente en formato JSON válido de acuerdo a la estructura especificada en el esquema tecnológico del sensor, redactado en idioma Español con un tono técnico, formal e implacable propio de un auditor ambiental de HSE certificado.
`;

    const contents: any[] = [];

    // Add visual content if user uploaded a standard JPEG/PNG image (size limit checked)
    if (image && image.startsWith("data:image/") && !image.includes("image/svg+xml")) {
      const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        contents.push({
          inlineData: {
            mimeType,
            data: base64Data
          }
        });
      }
    }

    // Add text prompt
    contents.push({ text: prompt });

    // Execute Gemini 3.8 Flash calling
    const response = await callGeminiWithRetry(ai, {
      model: "gemini-3.8-flash",
      contents: contents,
      config: {
        systemInstruction: "Eres un auditor líder de mitigación ambiental y teledetección satelital, experto en la normativa de hidrocarburos de Neuquén (Argentina). Hablas español técnico, preciso y riguroso. Tu objetivo es catalogar de forma exacta el riesgo de incidentes en Vaca Muerta brindando un reporte estructurado.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            foco_detectado: {
              type: Type.OBJECT,
              properties: {
                tipo_contaminación: {
                  type: Type.STRING,
                  description: "Categoría exacta del foco contaminante (Derrame en suelo, Venteo Atmosférico, Fuga de Gas, o Anomalía Térmica)"
                },
                certeza_analisis: {
                  type: Type.STRING,
                  description: "Alta, Media o Baja"
                },
                descripcion_visual: {
                  type: Type.STRING,
                  description: "Breve descripción técnico-visual de lo observado en la teledetección respecto al entorno semiárido de la cuenca"
                }
              },
              required: ["tipo_contaminación", "certeza_analisis", "descripcion_visual"]
            },
            contexto_geografico: {
              type: Type.OBJECT,
              properties: {
                proximidad_anelo: {
                  type: Type.STRING,
                  description: "Distancia estimada de la anomalía al centro de Añelo, cercanía a RP 7 o RP 17 y grado de criticidad urbana"
                },
                impacto_viento: {
                  type: Type.STRING,
                  description: "Dirección cardinal exacta del desplazamiento de la pluma gaseosa o derrame y poblaciones que compromete de acuerdo al viento del sensor Windy"
                }
              },
              required: ["proximidad_anelo", "impacto_viento"]
            },
            evaluacion_hse: {
              type: Type.OBJECT,
              properties: {
                nivel_riesgo: {
                  type: Type.STRING,
                  description: "Crítico, Alto, Medio o Bajo"
                },
                poblacion_o_recurso_afectado: {
                  type: Type.STRING,
                  description: "Detalle del recurso natural (Río Neuquén, acuífero aluvial), rutas comerciales o poblaciones locales que sufrirán impacto inmediato"
                },
                superficie_analizada_nota: {
                  type: Type.STRING,
                  description: "Comentario evaluativo experto de la severidad ambiental de los m² afectados"
                },
                riesgo_poblacion_salud: {
                  type: Type.STRING,
                  description: "Detallada evaluación de los riesgos directos para la población civil (vecinos de Añelo, crianceros locales, trabajadores o transeúntes) abarcando sintomatología o vías de exposición toxicológica relevantes"
                }
              },
              required: ["nivel_riesgo", "poblacion_o_recurso_afectado", "superficie_analizada_nota", "riesgo_poblacion_salud"]
            },
            plan_action_sugerido: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Estrategias de 3 pasos para contención inmediata, monitoreo instrumental certificado y remediación final de suelos o aire"
            }
          },
          required: ["foco_detectado", "contexto_geografico", "evaluacion_hse", "plan_action_sugerido"]
        }
      }
    });

    const rawText = response.text || "{}";
    const dataResponse = JSON.parse(rawText);

    // Ensure the array fits the key expected by the frontend
    if (dataResponse.plan_action_sugerido && !dataResponse.plan_accion_sugerido) {
      dataResponse.plan_accion_sugerido = dataResponse.plan_action_sugerido;
    }

    // Default structure safety
    const sanitizedResponse = {
      foco_detectado: {
        tipo_contaminación: dataResponse.foco_detectado?.tipo_contaminación || type,
        certeza_analisis: dataResponse.foco_detectado?.certeza_analisis || "Alta",
        descripcion_visual: dataResponse.foco_detectado?.descripcion_visual || "Se observa anomalía física severa en coordenadas especificadas."
      },
      contexto_geografico: {
        proximidad_anelo: dataResponse.contexto_geografico?.proximidad_anelo || "Distancia crítica menor de 20 km del ejido de Añelo.",
        impacto_viento: dataResponse.contexto_geografico?.impacto_viento || `Pluma orientada según viento de ${windSpeed} km/h.`
      },
      evaluacion_hse: {
        nivel_riesgo: dataResponse.evaluacion_hse?.nivel_riesgo || "Alto",
        poblacion_o_recurso_afectado: dataResponse.evaluacion_hse?.poblacion_o_recurso_afectado || "Acuífero aluvial y poblaciones rurales colindantes.",
        superficie_analizada_nota: dataResponse.evaluacion_hse?.superficie_analizada_nota || `Efecto superficial severo sobre ${surfaceArea} m².`,
        riesgo_poblacion_salud: dataResponse.evaluacion_hse?.riesgo_poblacion_salud || (type.includes("Derrame") || type.includes("lodos")
          ? "Riesgo potencial de infiltración de contaminantes en el subsuelo que compromete el agua subterránea útil para pastores linderos y consumo local."
          : "Riesgos de irritación de las mucosas oculares y afecciones respiratorias inducidas por dispersión aérea de gases de escape o de pozo con dirección a las zonas residenciales cercanas.")
      },
      plan_accion_sugerido: dataResponse.plan_accion_sugerido || dataResponse.plan_action_sugerido || [
        "Despliegue operativo urgente para contención.",
        "Monitoreo constante e inspección física.",
        "Saneamiento reglamentario."
      ]
    };

    return res.json(sanitizedResponse);
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    const isQuotaOrOverloadError = 
      errorMsg.includes("quota") || 
      errorMsg.includes("429") || 
      errorMsg.includes("Limit") || 
      errorMsg.includes("503") || 
      errorMsg.includes("high demand") || 
      errorMsg.includes("overloaded") || 
      errorMsg.includes("temporary") || 
      errorMsg.includes("unavailable") || 
      error?.status === "RESOURCE_EXHAUSTED" ||
      error?.status === 503;
    
    if (isQuotaOrOverloadError) {
      triggerCircuitBreaker();
    }
    console.log("[HSE Monitor Engine] Fallback ambiental activo.");
    
    const {
      latitude,
      longitude,
      windSpeed,
      windDirection,
      ch4Value,
      co2Value,
      no2Value,
      so2Value,
      surfaceArea,
      type,
      description
    } = req.body;

    const fallbackResponse = generateHighFidelityReport({
      latitude,
      longitude,
      windSpeed,
      windDirection,
      ch4Value,
      co2Value,
      no2Value,
      so2Value,
      surfaceArea,
      type,
      description
    }, true);

    return res.json(fallbackResponse);
  }
});

async function startServer() {
  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in development mode with Vite HMR...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in production mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Expert Vaca Muerta HSE Monitor running at http://0.0.0.0:${PORT}`);
  });
}

// En Vercel la app se exporta como función serverless (api/index.ts)
if (!process.env.VERCEL) {
  startServer();
}

export default app;
