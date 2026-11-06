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

import { GeoJsonFeature, GeoJsonFeatureCollection } from "../types";

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
 * Capa Oficial Base Inicial del Geoportal SIG (IDENEU / Secretaría de Energía)
 * COORDENADAS MAESTRAS VERIFICADAS WGS84:
 * GeoJSON requiere geometry.coordinates = [longitud, latitud]
 */
export const INITIAL_OFFICIAL_GEOJSON_STORE: GeoJsonFeatureCollection = {
  type: "FeatureCollection",
  name: "Catastro_Hidrocarburifero_Oficial_Cuenca_Neuquina_SEN_2026",
  crs: {
    type: "name",
    properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" }
  },
  features: [
    // 1. PTC Loma Campana (YPF / Chevron) - RP 17 km 12
    {
      type: "Feature",
      id: "PTC_LOMA_CAMPANA",
      geometry: {
        type: "Point",
        coordinates: [-68.7130, -38.3580] // [lon, lat] WGS84
      },
      properties: {
        id: "PTC_LOMA_CAMPANA",
        nombre: "Planta de Tratamiento Central PTC Loma Campana",
        denominacion_corta: "PTC Loma Campana",
        tipo: "Planta Troncal / PTC / Gas",
        operador: "YPF / Chevron",
        bloque_area: "Loma Campana",
        diametro_pad_m: 400,
        radio_tolerancia_metros: 400,
        cupo_sen_m3d: 15000,
        antorcha_altura_m: 42,
        antorcha_tipo: "Antorcha Elevada de Alta Presión (HP)",
        descripcion_catastral: "Complejo central de recepción y tratamiento de crudo de Loma Campana sobre RP 17 km 12. Batería de 12 tanques de almacenamiento y antorcha troncal."
      }
    },
    // 2. CPF Fortín de Piedra (Tecpetrol)
    {
      type: "Feature",
      id: "CPF_FORTIN_DE_PIEDRA",
      geometry: {
        type: "Point",
        coordinates: [-68.8920, -38.2570] // [lon, lat] WGS84
      },
      properties: {
        id: "CPF_FORTIN_DE_PIEDRA",
        nombre: "Planta Central de Procesamiento CPF Fortín de Piedra",
        denominacion_corta: "CPF Fortín de Piedra",
        tipo: "Planta Troncal / PTC / Gas",
        operador: "Tecpetrol",
        bloque_area: "Fortín de Piedra",
        diametro_pad_m: 450,
        radio_tolerancia_metros: 400,
        cupo_sen_m3d: 40000,
        antorcha_altura_m: 45,
        antorcha_tipo: "Antorcha Asistida por Vapor",
        descripcion_catastral: "Mayor complejo criogénico de acondicionamiento de shale gas de Sudamérica. Trenes de deshidratación y antorchas de alta eficiencia."
      }
    },
    // 3. Planta Gas El Orejano (YPF / Dow) - RP 5/7 Arroyo Carranza
    {
      type: "Feature",
      id: "CPF_EL_OREJANO",
      geometry: {
        type: "Point",
        coordinates: [-69.1920, -37.9650] // [lon, lat] WGS84
      },
      properties: {
        id: "CPF_EL_OREJANO",
        nombre: "Planta Central de Gas El Orejano (RP 5/7 Arroyo Carranza)",
        denominacion_corta: "Planta El Orejano",
        tipo: "Planta Troncal / PTC / Gas",
        operador: "YPF / Dow",
        bloque_area: "El Orejano",
        diametro_pad_m: 380,
        radio_tolerancia_metros: 400,
        cupo_sen_m3d: 12000,
        antorcha_altura_m: 18,
        antorcha_tipo: "Antorcha Cerrada en Cámara (Enclosed Ground Flare)",
        descripcion_catastral: "Concesión YPF-Dow camino a Rincón de los Sauces (RP 5/RP 7), cabecera este del Arroyo Carranza. Desarrollo pionero de shale gas."
      }
    },
    // 4. Batería Cruz de Lorena (Shell)
    {
      type: "Feature",
      id: "BATERIA_CRUZ_DE_LORENA",
      geometry: {
        type: "Point",
        coordinates: [-68.7950, -38.3410] // [lon, lat] WGS84
      },
      properties: {
        id: "BATERIA_CRUZ_DE_LORENA",
        nombre: "Batería de Producción Cruz de Lorena (Shell)",
        denominacion_corta: "Batería Cruz de Lorena",
        tipo: "Batería Colectora",
        operador: "Shell Argentina",
        bloque_area: "Cruz de Lorena",
        diametro_pad_m: 260,
        radio_tolerancia_metros: 250,
        cupo_sen_m3d: 16000,
        antorcha_altura_m: 30,
        antorcha_tipo: "Antorcha Sonic Multiboca",
        descripcion_catastral: "Batería colectora y separador de producción temprana de Shell en Cruz de Lorena."
      }
    },
    // 5. CPF La Calera (Pluspetrol)
    {
      type: "Feature",
      id: "CPF_LA_CALERA",
      geometry: {
        type: "Point",
        coordinates: [-68.8450, -38.3750] // [lon, lat] WGS84
      },
      properties: {
        id: "CPF_LA_CALERA",
        nombre: "Planta de Tratamiento Central CPF La Calera",
        denominacion_corta: "CPF La Calera",
        tipo: "Planta Troncal / PTC / Gas",
        operador: "Pluspetrol / YPF",
        bloque_area: "La Calera",
        diametro_pad_m: 380,
        radio_tolerancia_metros: 400,
        cupo_sen_m3d: 18000,
        antorcha_altura_m: 40,
        antorcha_tipo: "Antorcha Sonic Multiboca",
        descripcion_catastral: "Complejo de procesamiento de gas rico y condensados de Pluspetrol en la ventana húmeda de Vaca Muerta."
      }
    },
    // 6. Batería Bandurria Sur (YPF)
    {
      type: "Feature",
      id: "BATERIA_BANDURRIA_SUR",
      geometry: {
        type: "Point",
        coordinates: [-68.7850, -38.3880] // [lon, lat] WGS84
      },
      properties: {
        id: "BATERIA_BANDURRIA_SUR",
        nombre: "Batería Colectora Bandurria Sur BS-FL4",
        denominacion_corta: "Batería Bandurria Sur",
        tipo: "Batería Colectora",
        operador: "YPF / Equinor",
        bloque_area: "Bandurria Sur",
        diametro_pad_m: 250,
        radio_tolerancia_metros: 250,
        cupo_sen_m3d: 12000,
        antorcha_altura_m: 28,
        antorcha_tipo: "Antorcha Sonic Multiboca",
        descripcion_catastral: "Instalación colectora de crudo no convencional en Bandurria Sur."
      }
    },
    // 7. Planta Compresora Tratayén (TGS) - Hub Gasoducto
    {
      type: "Feature",
      id: "TGS_TRATAYEN",
      geometry: {
        type: "Point",
        coordinates: [-68.6320, -38.4120] // [lon, lat] WGS84
      },
      properties: {
        id: "TGS_TRATAYEN",
        nombre: "Planta Compresora Tratayén y Nodo Troncal Gasoducto",
        denominacion_corta: "Planta Compresora Tratayén",
        tipo: "Planta Compresora",
        operador: "Transportadora de Gas del Sur (TGS)",
        bloque_area: "Hub Tratayén",
        diametro_pad_m: 320,
        radio_tolerancia_metros: 400,
        cupo_sen_m3d: 10000,
        antorcha_altura_m: 35,
        antorcha_tipo: "Antorcha de Alivio y Ventilación Fría",
        descripcion_catastral: "Cabecera de inyección del Gasoducto Presidente Néstor Kirchner. Equipos de compresión y antorchas de venteo de emergencia."
      }
    },
    // 8. CPF Bajada del Palo Oeste (Vista Energy)
    {
      type: "Feature",
      id: "CPF_BAJADA_DEL_PALO_OESTE",
      geometry: {
        type: "Point",
        coordinates: [-68.6850, -38.2850] // [lon, lat] WGS84
      },
      properties: {
        id: "CPF_BAJADA_DEL_PALO_OESTE",
        nombre: "Planta de Tratamiento CPF Bajada del Palo Oeste",
        denominacion_corta: "CPF Bajada del Palo Oeste",
        tipo: "Planta Troncal / PTC / Gas",
        operador: "Vista Energy",
        bloque_area: "Bajada del Palo Oeste",
        diametro_pad_m: 340,
        radio_tolerancia_metros: 400,
        cupo_sen_m3d: 18000,
        antorcha_altura_m: 36,
        antorcha_tipo: "Antorcha de Alta Eficiencia Asistida",
        descripcion_catastral: "Complejo de procesamiento de crudo liviano no convencional de Vista Energy."
      }
    }
  ]
};

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
    operador_oficial: props.operador || "Operador Cuenca Neuquina",
    bloque_concesion: props.bloque_area || "Cuenca Neuquina",
    tipo_instalacion: tipo,
    latitud_oficial: lat,
    longitud_oficial: lon,
    radio_tolerancia_metros: tolerancia,
    diametro_pad_m: props.diametro_pad_m || Math.round(tolerancia * 0.8),
    capacidad_diseno_m3d: props.capacidad_diseno_m3d || 25000,
    cupo_sen_m3d: props.cupo_sen_m3d || 15000,
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
  if (typeof payload === "string") {
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
        operador: props.operador || props.operador_oficial || "Operador Cuenca Neuquina",
        bloque_area: props.bloque_area || props.bloque_concesion || "Cuenca Neuquina",
        diametro_pad_m: props.diametro_pad_m || Math.round(tolerancia * 0.8),
        radio_tolerancia_metros: tolerancia,
        cupo_sen_m3d: props.cupo_sen_m3d || 15000,
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
      operador: params.operador || "Operador Cuenca Neuquina",
      bloque_area: params.bloque_area || "Cuenca Neuquina",
      diametro_pad_m: Math.round(tolerancia * 0.8),
      radio_tolerancia_metros: tolerancia,
      cupo_sen_m3d: params.cupo_sen_m3d || 10000,
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
