/**
 * Módulo de Validación de Posicionamiento Catastral y Control de Falsos Positivos
 * 
 * Implementa la regla oficial de validación de catastro en campo:
 * Compara las coordenadas detectadas por satélite / sensor con las coordenadas oficiales
 * verificadas en campo mediante cálculo de distancia Haversine y radio de tolerancia en metros.
 */

export interface CoordenadaReferenciaCatastro {
  id: string;
  nombre: string;
  lat: number;
  lon: number;
  radio_tolerancia_metros: number;
  tipo_instalacion: string;
  operador: string;
}

/**
 * Diccionario con las coordenadas reales verificadas en campo (Catastro Oficial)
 */
export const COORDENADAS_REALES: Record<string, CoordenadaReferenciaCatastro> = {
  CPF_LOMA_CAMPANA: {
    id: "CPF_LOMA_CAMPANA",
    nombre: "PTC Loma Campana (YPF / Chevron) - RP 17 km 12",
    lat: -38.3580,
    lon: -68.7130,
    radio_tolerancia_metros: 400,
    tipo_instalacion: "Planta de Tratamiento Central (PTC / CPF)",
    operador: "YPF / Chevron"
  },
  CPF_FORTIN_DE_PIEDRA: {
    id: "CPF_FORTIN_DE_PIEDRA",
    nombre: "CPF Fortín de Piedra (Tecpetrol)",
    lat: -38.2570,
    lon: -68.8920,
    radio_tolerancia_metros: 400,
    tipo_instalacion: "Planta Central de Procesamiento Criogénico",
    operador: "Tecpetrol"
  },
  EL_OREJANO: {
    id: "EL_OREJANO",
    nombre: "Planta Central de Gas El Orejano (YPF / Dow) - RP 5/7 Arroyo Carranza",
    lat: -37.9650,
    lon: -69.1920,
    radio_tolerancia_metros: 400,
    tipo_instalacion: "Planta Central de Gas",
    operador: "YPF / Dow"
  },
  CRUZ_DE_LORENA: {
    id: "CRUZ_DE_LORENA",
    nombre: "Batería Cruz de Lorena (Shell)",
    lat: -38.3410,
    lon: -68.7950,
    radio_tolerancia_metros: 250,
    tipo_instalacion: "Batería Colectora",
    operador: "Shell Argentina"
  },
  LA_CALERA_CPF: {
    id: "LA_CALERA_CPF",
    nombre: "CPF La Calera (Pluspetrol)",
    lat: -38.3750,
    lon: -68.8450,
    radio_tolerancia_metros: 400,
    tipo_instalacion: "Central Processing Facility (CPF)",
    operador: "Pluspetrol"
  },
  BS_FL4: {
    id: "BS_FL4",
    nombre: "Batería Bandurria Sur (YPF)",
    lat: -38.3880,
    lon: -68.7850,
    radio_tolerancia_metros: 250,
    tipo_instalacion: "Batería Colectora",
    operador: "YPF / Equinor"
  },
  TRATAYEN_TGS: {
    id: "TRATAYEN_TGS",
    nombre: "Planta Compresora Tratayén (TGS)",
    lat: -38.4120,
    lon: -68.6320,
    radio_tolerancia_metros: 400,
    tipo_instalacion: "Planta Compresora",
    operador: "TGS"
  }
};

/**
 * Mapeo de alias o identificadores de UI a la clave de catastro
 */
export const ALIAS_CATASTRO_MAP: Record<string, string> = {
  "flare-loma-campana-central": "CPF_LOMA_CAMPANA",
  "CPF_LOMA_CAMPANA": "CPF_LOMA_CAMPANA",
  "Loma Campana": "CPF_LOMA_CAMPANA",
  "CPF Loma Campana": "CPF_LOMA_CAMPANA",
  
  "flare-bandurria-sur-bs4": "BS_FL4",
  "BS_FL4": "BS_FL4",
  "BS-FL4": "BS_FL4",
  "Bandurria Sur": "BS_FL4",
  "Batería Colectora BS-FL4": "BS_FL4",
  
  "flare-fortin-de-piedra-ptg": "CPF_FORTIN_DE_PIEDRA",
  "CPF_FORTIN_DE_PIEDRA": "CPF_FORTIN_DE_PIEDRA",
  "Fortín de Piedra": "CPF_FORTIN_DE_PIEDRA",
  
  "flare-tratayen-tgs": "TRATAYEN_TGS",
  "TRATAYEN_TGS": "TRATAYEN_TGS",
  "Tratayén": "TRATAYEN_TGS",
  
  "flare-la-calera-cpf": "LA_CALERA_CPF",
  "LA_CALERA_CPF": "LA_CALERA_CPF",
  "La Calera": "LA_CALERA_CPF",

  "flare-el-orejano-eo3": "EL_OREJANO",
  "EL_OREJANO": "EL_OREJANO",
  "El Orejano": "EL_OREJANO",
  "Planta de Gas El Orejano": "EL_OREJANO"
};

/**
 * Calcula la distancia ortodrómica en metros entre dos coordenadas esféricas (Haversine)
 */
export function calcular_distancia_haversine(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number {
  const R = 6371000; // Radio medio de la Tierra en metros
  const rad = (deg: number) => (deg * Math.PI) / 180;
  
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export interface ResultadoValidacionPosicion {
  valido: boolean;
  mensaje: string;
  distancia_metros: number;
  tolerancia_metros?: number;
  id_planta: string;
  planta_registrada: boolean;
  referencia_oficial?: CoordenadaReferenciaCatastro;
  posible_confusion: boolean;
}

/**
 * Regla de validación para evitar falsos posicionamientos
 * 
 * Comprueba si la alerta o detección satelital se encuentra dentro del radio de tolerancia
 * respecto a las coordenadas oficiales de catastro verificado en campo.
 */
export function verificar_posicion_planta(
  id_planta: string, 
  lat_detectada: number, 
  lon_detectada: number
): ResultadoValidacionPosicion {
  const normalizedKey = ALIAS_CATASTRO_MAP[id_planta] || id_planta;
  
  if (normalizedKey in COORDENADAS_REALES) {
    const ref = COORDENADAS_REALES[normalizedKey];
    // Calcular distancia entre lo detectado por el satélite y la planta real
    const distancia = calcular_distancia_haversine(lat_detectada, lon_detectada, ref.lat, ref.lon);
    
    if (distancia > ref.radio_tolerancia_metros) {
      return {
        valido: false,
        mensaje: `Error de posicionamiento: La alerta se ubicó a ${distancia}m de la planta real. Posible confusión con Cargadero.`,
        distancia_metros: distancia,
        tolerancia_metros: ref.radio_tolerancia_metros,
        id_planta: normalizedKey,
        planta_registrada: true,
        referencia_oficial: ref,
        posible_confusion: true
      };
    }

    return {
      valido: true,
      mensaje: "Posicionamiento dentro del rango oficial.",
      distancia_metros: distancia,
      tolerancia_metros: ref.radio_tolerancia_metros,
      id_planta: normalizedKey,
      planta_registrada: true,
      referencia_oficial: ref,
      posible_confusion: false
    };
  }

  // Si la planta no tiene registro catastral cargado
  return {
    valido: true,
    mensaje: "Planta sin ficha catastral restrictiva. Posicionamiento admitido.",
    distancia_metros: 0,
    id_planta,
    planta_registrada: false,
    posible_confusion: false
  };
}
