export interface Hotspot {
  id: string;
  name: string;
  locationName: string;
  latitude: number;
  longitude: number;
  type: "Derrame en suelo" | "Venteo Atmosférico" | "Fuga de Gas" | "Anomalía Térmica" | "Acumulación de lodos" | "Derrame en agua";
  windSpeed: number; // km/h
  windDirection: string; // e.g. "W", "SW", "NW", "E", "S"
  ch4Value: number; // ppm (CAMS)
  co2Value: number; // ppm (CAMS)
  no2Value: number; // ppb (CAMS)
  so2Value: number; // ppb (CAMS)
  surfaceArea: number; // m²
  status: "Crítico" | "Alto" | "Medio" | "Bajo";
  description: string;
  imageUrl: string;
}

export interface AnalysisResponse {
  foco_detectado: {
    tipo_contaminación: string;
    certeza_analisis: string;
    descripcion_visual: string;
  };
  contexto_geografico: {
    proximidad_anelo: string;
    impacto_viento: string;
  };
  evaluacion_hse: {
    nivel_riesgo: "Crítico" | "Alto" | "Medio" | "Bajo";
    poblacion_o_recurso_afectado: string;
    superficie_analizada_nota: string;
    riesgo_poblacion_salud?: string;
  };
  plan_accion_sugerido: string[];
}

export type VenteoStatus = "Crítico" | "En Observación" | "Operativo";

export type VenteoType = 
  | "Antorcha Elevada de Alta Presión (HP)"
  | "Antorcha de Alivio y Emergencia (LP)"
  | "Antorcha Sonic Multiboca"
  | "Antorcha Asistida por Vapor"
  | "Antorcha de Pozo en Ensayo"
  | "Antorcha Cerrada en Cámara (Enclosed)"
  | "Fosa de Quema Transitoria"
  | "Venteo Frío Directo (Sin Llama)";

export interface VenteoSite {
  id: string;
  name: string;
  block: string;
  operator: string;
  latitude: number;
  longitude: number;
  status: VenteoStatus;
  flareType: VenteoType;
  burnRateM3Day: number;
  combustionEfficiency: number; // %
  flameTempC: number;
  stackHeightM: number;
  thermalPowerMW: number;
  ch4ConcentrationPpm: number;
  nearestTown: string;
  nearestTownDistanceKm: number;
  windSpeed: number;
  windDirection: string;
  authorizedQuotaM3Day: number;
  daysActiveThisMonth: number;
  lastSatellitePass: string;
  isColdVent: boolean;
  notes: string;
  facilityImage?: string;
  infrastructureType?: string;
  padDimensionsM?: { width: number; height: number };
  tanksCount?: number;
  ultima_deteccion_satelital?: {
    fecha: string;
    sensor?: string;
    resolucion_m?: number;
  };
  fecha_registro_sistema?: string;
  cadastralId?: string;
}

export interface FechaAnomaliaValidacion {
  valido: boolean;
  mensaje: string;
  fecha_satelite?: string;
  fecha_sistema?: string;
}

export interface VenteoAuditResponse {
  success: boolean;
  flareId: string;
  calificacion_legal: string;
  score_infraccion: number;
  es_infraccion_grave: boolean;
  diagnostico_termodinamico: string;
  impacto_poblacion_cercana: string;
  dispersion_pluma_viento: string;
  medidas_ingenieriles_mitigacion: string[];
  sancion_estimada_pesos_o_modulos: string;
  plazo_intimacion_horas: number;
  emisiones_estimadas: {
    ch4_fugitivo_ton_ano: number;
    co2_ton_ano: number;
    so2_kg_dia: number;
    nox_kg_dia: number;
    black_carbon_kg_dia: number;
  };
  validacion_temporal_satelite?: FechaAnomaliaValidacion;
  validacion_posicion_catastro?: ValidacionPosicionCatastro;
}

export interface ValidacionPosicionCatastro {
  valido: boolean;
  mensaje: string;
  distancia_metros: number;
  tolerancia_metros?: number;
  coordenadas_catastro?: { lat: number; lon: number };
  posible_confusion?: boolean;
}

export type TipoInstalacionCatastral =
  | "Planta Troncal / PTC / Gas"
  | "Batería Colectora"
  | "Pad de Producción / Pozo"
  | "Ducto e Interconexión"
  | "Cargadero"
  | "Planta Compresora"
  | "Otro";

export interface GeoJsonFeatureProperties {
  id: string;
  nombre: string;
  tipo: TipoInstalacionCatastral | string;
  operador: string;
  bloque_area: string;
  diametro_pad_m?: number;
  radio_tolerancia_metros?: number;
  cupo_sen_m3d?: number;
  antorcha_altura_m?: number;
  antorcha_tipo?: string;
  denominacion_corta?: string;
  descripcion_catastral?: string;
  fecha_incorporacion?: string;
}

export interface GeoJsonGeometry {
  type: "Point" | "LineString" | "Polygon";
  coordinates: any; // [lon, lat] for Point
}

export interface GeoJsonFeature {
  type: "Feature";
  id?: string | number;
  geometry: GeoJsonGeometry;
  properties: GeoJsonFeatureProperties;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  name?: string;
  crs?: {
    type: string;
    properties: { name: string };
  };
  features: GeoJsonFeature[];
}



