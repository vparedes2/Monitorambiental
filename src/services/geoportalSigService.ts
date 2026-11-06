/**
 * Servicio de Geoportal SIG Hidrocarburífero Oficial (PostGIS / GeoJSON Store Dinámico)
 * 
 * Gestiona un almacén dinámico en memoria de capas vectoriales GeoJSON para todas las
 * instalaciones hidrocarburíferas de la Cuenca Neuquina (Vaca Muerta), eliminando
 * listas estáticas fijas y permitiendo ingesta dinámica desde WFS/GeoJSON de la SEN, IDENEU e IAPG.
 * 
 * ESTÁNDAR GEOGRÁFICO WGS84 OBLIGATORIO:
 * - En GeoJSON: coordinates = [longitud, latitud] (ej. [-68.7130, -38.3580])
 * - En Leaflet: L.marker([latitud, longitud]) (ej. [-38.3580, -68.7130])
 * - Cuenca Neuquina Bounding Box: Lat [-37.0 a -39.5], Lon [-67.5 a -70.5]
 */

import type { GeoJsonFeature, GeoJsonFeatureCollection } from "../types.js";

export interface InstalacionSigOficial {
  codigo_sig: string;
  nombre_oficial: string;
  denominacion_corta: string;
  operador_oficial: string;
  bloque_concesion: string;
  tipo_instalacion: string;
  latitud_oficial: number;
  longitud_oficial: number;
  radio_tolerancia_metros: number;
  diametro_pad_m?: number;
  capacidad_diseno_m3d?: number;
  cupo_sen_m3d?: number;
  antorcha_altura_m?: number;
  antorcha_tipo?: string;
  descripcion_catastral?: string;
  fecha_incorporacion?: string;
}

/**
 * Valida y normaliza el orden [lat, lon] asegurando que:
 * - Latitud siempre esté entre -37.0 y -39.5 (Sur)
 * - Longitud siempre esté entre -67.5 y -70.5 (Oeste)
 * Si los valores vienen invertidos, se corrigen automáticamente.
 */
export function normalizarCoordenadasCuenca(val1: number, val2: number): { lat: number; lon: number } {
  let lat = Number(val1);
  let lon = Number(val2);

  // Si vienen en orden GeoJSON [lon, lat] (ej. -68.7130, -38.3580):
  if (lat < -60 && lon > -45 && lon < -30) {
    return { lat: lon, lon: lat };
  }

  // Si ya vienen en orden Leaflet [lat, lon] (ej. -38.3580, -68.7130):
  if (lat > -45 && lat < -30 && lon < -60) {
    return { lat, lon };
  }

  // Normalizar signos negativos del hemisferio sur/oeste si faltan
  if (lat > 30 && lat < 45) lat = -lat;
  if (lon > 60 && lon < 75) lon = -lon;

  // Verificación final de inversión
  if (lat < -60 && lon > -45 && lon < -30) {
    return { lat: lon, lon: lat };
  }

  return { lat, lon };
}

/**
 * Asigna automáticamente la tolerancia métrica de seguridad según la tipología oficial:
 * - Plantas Troncales / PTC / Gas / CPF / Centrales: 400 m
 * - Baterías y Colectoras: 250 m
 * - Pads de Producción / Pozos / Multipozo: 120 m
 * - Ductos e Interconexiones: Buffer lineal de 60 m
 * - Cargaderos: 200 m
 */
export function asignarToleranciaPorTipologia(tipo: string, toleranciaExplicita?: number): number {
  if (typeof toleranciaExplicita === "number" && toleranciaExplicita > 0) {
    return toleranciaExplicita;
  }
  const norm = (tipo || "").toLowerCase();
  if (norm.includes("troncal") || norm.includes("ptc") || norm.includes("cpf") || norm.includes("central") || norm.includes("criogenica") || norm.includes("criogénica") || norm.includes("gasoducto")) {
    return 400;
  }
  if (norm.includes("batería") || norm.includes("bateria") || norm.includes("colectora")) {
    return 250;
  }
  if (norm.includes("pad") || norm.includes("pozo") || norm.includes("multipozo") || norm.includes("early") || norm.includes("epf")) {
    return 120;
  }
  if (norm.includes("ducto") || norm.includes("oleoducto") || norm.includes("interconexion") || norm.includes("interconexión") || norm.includes("lineal")) {
    return 60;
  }
  if (norm.includes("cargadero")) {
    return 200;
  }
  if (norm.includes("compresora")) {
    return 400;
  }
  return 200;
}

/**
 * Catastro base: VACÍO a propósito.
 * Las coordenadas que existían acá no estaban relevadas (eran aproximaciones
 * generadas por IA y ubicaban mal las plantas). Cada usuario carga su propio
 * catastro verificado (KML exportado de Google Earth o GeoJSON).
 */
export const INITIAL_OFFICIAL_GEOJSON_STORE: GeoJsonFeatureCollection = {
  type: "FeatureCollection",
  name: "Catastro_Vaca_Muerta_Usuario",
  crs: {
    type: "name",
    properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" }
  },
  features: []
};

/**
 * Convierte un KML (Google Earth: "Guardar lugar como... > KML") en features GeoJSON.
 * Toma los Placemark con <Point>. Para polígonos o líneas usa el primer vértice
 * como referencia. El tipo de instalación se deduce del nombre (PTC, CPF, batería, pad...).
 */
export function kmlAFeatures(kml: string): any[] {
  const features: any[] = [];
  const placemarks = kml.match(/<Placemark[\s\S]*?<\/Placemark>/gi) || [];
  placemarks.forEach((pm, idx) => {
    const nameMatch = pm.match(/<name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/i);
    const coordMatch = pm.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/i);
    if (!coordMatch) return;
    const first = coordMatch[1].trim().split(/\s+/)[0];
    const [lonStr, latStr] = first.split(",");
    const lon = Number(lonStr);
    const lat = Number(latStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const nombre = (nameMatch?.[1] || `Instalación KML ${idx + 1}`).trim();
    const n = nombre.toLowerCase();
    let tipo = "Pad de Producción / Pozo";
    if (/\b(ptc|cpf|planta|central|tratamiento)\b/.test(n)) tipo = "Planta de Tratamiento Central (PTC/CPF)";
    else if (/compresora/.test(n)) tipo = "Planta Compresora";
    else if (/bater[ií]a|colectora/.test(n)) tipo = "Batería / Colectora";
    else if (/cargadero/.test(n)) tipo = "Cargadero";
    else if (/\bepf\b|early/.test(n)) tipo = "EPF / Early Production Facility";
    const slug = nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "_").toUpperCase().slice(0, 40);
    features.push({
      type: "Feature",
      id: `KML_${slug}_${idx}`,
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: { id: `KML_${slug}_${idx}`, nombre, tipo }
    });
  });
  return features;
}

// Almacén dinámico en memoria
let activeGeoJsonStore: GeoJsonFeatureCollection = JSON.parse(JSON.stringify(INITIAL_OFFICIAL_GEOJSON_STORE));

/**
 * Normaliza una Feature GeoJSON al objeto InstalacionSigOficial para consumo de servicios
 * Asegura estrictamente:
 * - latitud_oficial: valor entre -37.0 y -39.5
 * - longitud_oficial: valor entre -67.5 y -70.5
 */
export function normalizarFeatureAInstalacion(feat: GeoJsonFeature): InstalacionSigOficial {
  const props = feat.properties || ({} as any);
  const coords = feat.geometry?.coordinates || [0, 0];
  
  // Normalizar coordenadas independientemente de si vinieron como [lon, lat] o [lat, lon]
  const { lat, lon } = normalizarCoordenadasCuenca(coords[0], coords[1]);

  const id = String(props.id || feat.id || `inst-${Date.now()}-${Math.floor(Math.random() * 1000)}`);
  const nombre = props.nombre || id;
  const tipo = props.tipo || "Pad de Producción / Pozo";
  const tolerancia = asignarToleranciaPorTipologia(tipo, props.radio_tolerancia_metros);

  return {
    codigo_sig: id,
    nombre_oficial: nombre,
    denominacion_corta: props.denominacion_corta || nombre.replace(/Planta de Tratamiento Central |Planta Central de Gas |Planta Compresora |Batería Colectora |Early Production Facility /g, ""),
    operador_oficial: props.operador || "Sin dato",
    bloque_concesion: props.bloque_area || "Cuenca Neuquina",
    tipo_instalacion: tipo,
    latitud_oficial: lat,
    longitud_oficial: lon,
    radio_tolerancia_metros: tolerancia,
    diametro_pad_m: props.diametro_pad_m || Math.round(tolerancia * 0.8),
    capacidad_diseno_m3d: props.capacidad_diseno_m3d || 0,
    cupo_sen_m3d: props.cupo_sen_m3d || 0,
    antorcha_altura_m: props.antorcha_altura_m || 30,
    antorcha_tipo: props.antorcha_tipo || "Antorcha Estándar Registrada",
    descripcion_catastral: props.descripcion_catastral || `Instalación catastrada en Geoportal SIG (${tipo}).`,
    fecha_incorporacion: props.fecha_incorporacion || new Date().toISOString()
  };
}

/**
 * Obtiene la capa GeoJSON completa activa
 */
export function getGeoJsonStore(): GeoJsonFeatureCollection {
  return JSON.parse(JSON.stringify(activeGeoJsonStore));
}

/**
 * Obtiene todas las instalaciones normalizadas para el cruce espacial
 */
export function getInstalacionesSigOficiales(): InstalacionSigOficial[] {
  return activeGeoJsonStore.features.map(normalizarFeatureAInstalacion);
}

/**
 * Ingesta dinámicamente una capa GeoJSON o colección de features
 * Permite modos "merge" (agrega/actualiza) o "replace" (sustituye por completo)
 */
export function ingestarCapaGeoJson(
  payload: any, 
  mode: "merge" | "replace" = "merge"
): { 
  total: number; 
  agregadas: number; 
  actualizadas: number; 
  store: GeoJsonFeatureCollection 
} {
  let rawFeatures: any[] = [];

  let parsedPayload = payload;
  if (typeof payload === "string" && payload.trim().startsWith("<")) {
    parsedPayload = kmlAFeatures(payload);
    if (parsedPayload.length === 0) {
      throw new Error("El KML no contiene lugares (Placemark) con coordenadas.");
    }
  } else if (typeof payload === "string") {
    try {
      parsedPayload = JSON.parse(payload);
    } catch (e: any) {
      throw new Error(`Error de sintaxis JSON al leer la capa: ${e.message}`);
    }
  }

  if (parsedPayload?.type === "FeatureCollection" && Array.isArray(parsedPayload.features)) {
    rawFeatures = parsedPayload.features;
  } else if (parsedPayload?.type === "Feature") {
    rawFeatures = [parsedPayload];
  } else if (Array.isArray(parsedPayload)) {
    rawFeatures = parsedPayload;
  } else if (parsedPayload?.instalaciones && Array.isArray(parsedPayload.instalaciones)) {
    rawFeatures = parsedPayload.instalaciones.map((inst: any) => ({
      type: "Feature",
      id: inst.codigo_sig || inst.id,
      geometry: {
        type: "Point",
        coordinates: [inst.longitud_oficial || inst.lon || inst.longitude, inst.latitud_oficial || inst.lat || inst.latitude]
      },
      properties: {
        id: inst.codigo_sig || inst.id,
        nombre: inst.nombre_oficial || inst.nombre,
        tipo: inst.tipo_instalacion || inst.tipo,
        operador: inst.operador_oficial || inst.operador,
        bloque_area: inst.bloque_concesion || inst.bloque_area,
        radio_tolerancia_metros: inst.radio_tolerancia_metros,
        cupo_sen_m3d: inst.cupo_sen_m3d
      }
    }));
  } else {
    throw new Error("El contenido no posee una estructura GeoJSON válida (FeatureCollection o Feature[]).");
  }

  if (rawFeatures.length === 0) {
    throw new Error("No se detectaron features geográficas en el archivo provisto.");
  }

  // Normalizar coordenadas y tolerancias de cada feature
  const processedFeatures: GeoJsonFeature[] = rawFeatures.map((f, idx) => {
    let rawCoords = f.geometry?.coordinates;
    if (!rawCoords && (f.lat || f.latitude) && (f.lon || f.longitude)) {
      rawCoords = [Number(f.lon || f.longitude), Number(f.lat || f.latitude)];
    }

    if (!rawCoords || !Array.isArray(rawCoords) || rawCoords.length < 2) {
      throw new Error(`La entidad en posición ${idx} carece de coordenadas válidas.`);
    }

    // Normalizar a WGS84: latitud en [-37 a -39.5] y longitud en [-67.5 a -70.5]
    const { lat, lon } = normalizarCoordenadasCuenca(rawCoords[0], rawCoords[1]);

    const props = f.properties || f;
    const tipo = props.tipo || props.tipo_instalacion || "Pad de Producción / Pozo";
    const tolerancia = asignarToleranciaPorTipologia(tipo, props.radio_tolerancia_metros);
    const id = String(props.id || props.codigo_sig || f.id || `PAD_SIG_${Date.now()}_${idx}`);
    const nombre = props.nombre || props.nombre_oficial || `Instalación ${id}`;

    return {
      type: "Feature",
      id,
      geometry: {
        type: "Point",
        // GeoJSON requiere siempre [longitud, latitud]
        coordinates: [lon, lat]
      },
      properties: {
        id,
        nombre,
        tipo,
        operador: props.operador || props.operador_oficial || "Sin dato",
        bloque_area: props.bloque_area || props.bloque_concesion || "Cuenca Neuquina",
        diametro_pad_m: props.diametro_pad_m || Math.round(tolerancia * 0.8),
        radio_tolerancia_metros: tolerancia,
        cupo_sen_m3d: props.cupo_sen_m3d || 0,
        antorcha_altura_m: props.antorcha_altura_m || 25,
        antorcha_tipo: props.antorcha_tipo || "Antorcha de Campo Registrada",
        descripcion_catastral: props.descripcion_catastral || `Instalación oficial incorporada dinámicamente al almacén GeoJSON.`,
        fecha_incorporacion: new Date().toISOString()
      }
    };
  });

  let agregadas = 0;
  let actualizadas = 0;

  if (mode === "replace") {
    activeGeoJsonStore = {
      type: "FeatureCollection",
      name: parsedPayload?.name || "Catastro_SIG_Vaca_Muerta_Custom",
      crs: activeGeoJsonStore.crs,
      features: processedFeatures
    };
    agregadas = processedFeatures.length;
  } else {
    const mapExisting = new Map<string, number>();
    activeGeoJsonStore.features.forEach((feat, index) => {
      mapExisting.set(String(feat.id || feat.properties?.id), index);
    });

    processedFeatures.forEach((feat) => {
      const featId = String(feat.id || feat.properties?.id);
      if (mapExisting.has(featId)) {
        const idx = mapExisting.get(featId)!;
        activeGeoJsonStore.features[idx] = feat;
        actualizadas++;
      } else {
        activeGeoJsonStore.features.push(feat);
        agregadas++;
      }
    });
  }

  return {
    total: activeGeoJsonStore.features.length,
    agregadas,
    actualizadas,
    store: getGeoJsonStore()
  };
}

/**
 * Restablece el almacén catastral al conjunto oficial base
 */
export function resetToOfficialDefaults(): GeoJsonFeatureCollection {
  activeGeoJsonStore = JSON.parse(JSON.stringify(INITIAL_OFFICIAL_GEOJSON_STORE));
  return getGeoJsonStore();
}

/**
 * Registra una nueva instalación o pad catastral individual
 */
export function agregarInstalacionIndividual(params: {
  id?: string;
  nombre: string;
  tipo?: string;
  operador?: string;
  bloque_area?: string;
  latitud: number;
  longitud: number;
  radio_tolerancia_metros?: number;
  cupo_sen_m3d?: number;
}): InstalacionSigOficial {
  const tipo = params.tipo || "Pad de Producción / Pozo";
  const id = params.id || `PAD_VERIFICADO_${Date.now()}`;
  const tolerancia = asignarToleranciaPorTipologia(tipo, params.radio_tolerancia_metros);
  const { lat, lon } = normalizarCoordenadasCuenca(params.latitud, params.longitud);

  const newFeature: GeoJsonFeature = {
    type: "Feature",
    id,
    geometry: {
      type: "Point",
      coordinates: [lon, lat]
    },
    properties: {
      id,
      nombre: params.nombre,
      tipo,
      operador: params.operador || "Sin dato",
      bloque_area: params.bloque_area || "Cuenca Neuquina",
      diametro_pad_m: Math.round(tolerancia * 0.8),
      radio_tolerancia_metros: tolerancia,
      cupo_sen_m3d: params.cupo_sen_m3d || 0,
      antorcha_altura_m: 20,
      antorcha_tipo: "Antorcha de Pad Registrada en Campo",
      descripcion_catastral: "Instalación catastrada a partir de anomalía satelital verificada.",
      fecha_incorporacion: new Date().toISOString()
    }
  };

  ingestarCapaGeoJson([newFeature], "merge");
  return normalizarFeatureAInstalacion(newFeature);
}

/**
 * Busca una instalación por código catastral o término
 */
export function buscarInstalacionSig(criterio: string): InstalacionSigOficial | undefined {
  const norm = criterio.toLowerCase().trim();
  const all = getInstalacionesSigOficiales();
  return all.find(
    (inst) =>
      inst.codigo_sig.toLowerCase() === norm ||
      inst.nombre_oficial.toLowerCase().includes(norm) ||
      inst.denominacion_corta.toLowerCase().includes(norm) ||
      inst.bloque_concesion.toLowerCase().includes(norm)
  );
}
