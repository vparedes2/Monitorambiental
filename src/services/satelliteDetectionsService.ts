/**
 * Servicio de detecciones térmicas satelitales (NASA FIRMS - VIIRS).
 *
 * IMPORTANTE: este módulo NO contiene detecciones inventadas. Las detecciones
 * provienen únicamente de la API pública de NASA FIRMS (requiere FIRMS_MAP_KEY
 * en el servidor) o de detecciones cargadas manualmente vía
 * POST /api/satellites/ingestar-deteccion.
 *
 * Bounding Box Cuenca Neuquina (Vaca Muerta): Lat [-37.0 a -39.5], Lon [-67.5 a -70.5]
 */

import { getInstalacionesSigOficiales } from "./geoportalSigService";
import {
  DeteccionSatelitalRaw,
  CruceEspacialVenteo,
  SensorSatelital,
  resolverCruceEspacialIndividual
} from "./spatialJoin";

export type { DeteccionSatelitalRaw, CruceEspacialVenteo, SensorSatelital };

export const BBOX_CUENCA = { west: -70.5, south: -39.5, east: -67.5, north: -37.0 };

/** Fuentes NRT de FIRMS (VIIRS 375 m) que se consultan */
export const FIRMS_SOURCES: { source: string; sensor: string }[] = [
  { source: "VIIRS_NOAA20_NRT", sensor: "NASA FIRMS (VIIRS NOAA-20)" },
  { source: "VIIRS_NOAA21_NRT", sensor: "NASA FIRMS (VIIRS NOAA-21)" },
  { source: "VIIRS_SNPP_NRT", sensor: "NASA FIRMS (VIIRS Suomi-NPP)" }
];

// Sin datos precargados: la lista arranca vacía y se llena con datos reales.
export const DETECCIONES_ORBITALES_ACTIVAS: DeteccionSatelitalRaw[] = [];

let deteccionesFirms: DeteccionSatelitalRaw[] = [];
let deteccionesManuales: DeteccionSatelitalRaw[] = [];

const CONFIANZA_VIIRS: Record<string, number> = { l: 30, low: 30, n: 60, nominal: 60, h: 90, high: 90 };

/**
 * Convierte el CSV de la API "area" de NASA FIRMS (VIIRS) a detecciones.
 * Columnas VIIRS: latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,
 * satellite,instrument,confidence,version,bright_ti5,frp,daynight
 */
export function parseFirmsCsv(csv: string, sensor: string): DeteccionSatelitalRaw[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = (lines[0] || "").split(",").map((h) => h.trim().toLowerCase());
  if (!header.includes("latitude") || !header.includes("longitude")) {
    // FIRMS devuelve texto plano con el error (ej. "Invalid MAP_KEY")
    throw new Error((lines[0] || "respuesta vacía").slice(0, 200));
  }
  if (lines.length < 2) return [];
  const idx = (name: string) => header.indexOf(name);

  const out: DeteccionSatelitalRaw[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;
    const lat = Number(cols[idx("latitude")]);
    const lon = Number(cols[idx("longitude")]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (lat > BBOX_CUENCA.north || lat < BBOX_CUENCA.south || lon < BBOX_CUENCA.west || lon > BBOX_CUENCA.east) continue;

    const date = cols[idx("acq_date")] || "";
    const timeRaw = (cols[idx("acq_time")] || "0").padStart(4, "0");
    const time = `${timeRaw.slice(0, 2)}:${timeRaw.slice(2, 4)}`;
    const confRaw = (cols[idx("confidence")] || "").trim().toLowerCase();
    const confianza = CONFIANZA_VIIRS[confRaw] ?? (Number(confRaw) || 0);
    const daynight = (cols[idx("daynight")] || "").trim().toUpperCase();

    out.push({
      id_deteccion: `FIRMS-${sensor.replace(/\D+/g, "") || "VIIRS"}-${date.replace(/-/g, "")}${timeRaw}-${lat.toFixed(4)}_${lon.toFixed(4)}`,
      sensor,
      banda_espectral: `I4 (3.74 µm) · ${daynight === "N" ? "pasada nocturna" : "pasada diurna"}`,
      resolucion_espacial_m: 375,
      latitud_satelital: lat,
      longitud_satelital: lon,
      frp_mw: Number(cols[idx("frp")]) || 0,
      temperatura_brillo_k: Number(cols[idx("bright_ti4")]) || 0,
      temperatura_llama_c: null,
      fecha_hora_utc: `${date} ${time} UTC`,
      confianza_deteccion: confianza,
      tasa_quema_estimada_m3d: null,
      eficiencia_combustion_est: null,
      es_venteo_frio: false,
      fuente_catalogo: "NASA FIRMS (datos reales NRT)"
    });
  }
  return out;
}

/** Reemplaza las detecciones obtenidas de FIRMS */
export function setDeteccionesFirms(lista: DeteccionSatelitalRaw[]): void {
  deteccionesFirms = lista;
}

/** Registra manualmente una detección (ej. desde otra fuente verificada) */
export function ingestarDeteccionSatelital(nuevaDeteccion: DeteccionSatelitalRaw): CruceEspacialVenteo {
  deteccionesManuales.unshift(nuevaDeteccion);
  const universo = getInstalacionesSigOficiales();
  return resolverCruceEspacialIndividual(nuevaDeteccion, universo);
}

/** Borra las detecciones cargadas manualmente */
export function resetDeteccionesSatelitales(): void {
  deteccionesManuales = [];
}

/**
 * Cruce espacial de TODAS las detecciones activas (FIRMS + manuales)
 * contra el catastro cargado. Si dist > tolerancia => ANOMALIA_NO_CATASTRADA.
 */
export function ejecutarCruceEspacialSatelital(): CruceEspacialVenteo[] {
  const universoInstalaciones = getInstalacionesSigOficiales();
  return [...deteccionesManuales, ...deteccionesFirms].map((deteccion) =>
    resolverCruceEspacialIndividual(deteccion, universoInstalaciones)
  );
}
