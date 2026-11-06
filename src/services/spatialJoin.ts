/**
 * Motor Determinista de Cruce Espacial (Spatial Join Engine)
 * 
 * Evalúa las observaciones térmicas emitidas por radiómetros orbitales (NASA FIRMS / Sentinel-2)
 * contra el universo de instalaciones catastradas en el Geoportal SIG Oficial (SEN/IDENEU).
 * 
 * Regla de Oro Regulatoria (Prevención de saltos):
 * - Si distancia(satélite, instalación) <= tolerancia_catastral (ej. 400m para PTC/CPF, 250m para Baterías, 120m para Pads):
 *     => MATCH CATASTRAL ASOCIADO (CORRELACION_OFICIAL_DIRECTA)
 * - Si distancia(satélite, instalación) > tolerancia_catastral:
 *     => ANOMALÍA TÉRMICA NO CATASTRADA (ANOMALIA_NO_CATASTRADA). 
 *     => NUNCA se fuerza la asociación a esa planta; el marcador y alerta permanecen estrictamente
 *        en la coordenada nativa reportada por el satélite con enlace de verificación en Google Earth HD.
 */

import { InstalacionSigOficial, normalizarCoordenadasCuenca } from "./geoportalSigService";
import { calcular_distancia_haversine } from "./cadastralValidation";

export type SensorSatelital = 
  | "NASA FIRMS (VIIRS NOAA-20)"
  | "NASA FIRMS (VIIRS Suomi-NPP)"
  | "NASA FIRMS (VIIRS NOAA-21)"
  | "Copernicus Sentinel-2C MSI"
  | "Copernicus Sentinel-2B MSI";

export interface DeteccionSatelitalRaw {
  id_deteccion: string;
  sensor: SensorSatelital;
  banda_espectral: string;
  resolucion_espacial_m: number;
  latitud_satelital: number;
  longitud_satelital: number;
  frp_mw: number; // Fire Radiative Power en Megavatios emitido por el sensor
  temperatura_brillo_k: number;
  temperatura_llama_c: number;
  fecha_hora_utc: string;
  confianza_deteccion: number;
  tasa_quema_estimada_m3d: number;
  eficiencia_combustion_est: number;
  es_venteo_frio: boolean;
  fuente_catalogo?: string;
}

export type TipoCorrelacionCatastral = 
  | "CORRELACION_OFICIAL_DIRECTA" 
  | "ANOMALIA_NO_CATASTRADA";

export interface VectorDesvioInstrumental {
  distancia_m: number;
  rumbo: string;
  grados: number;
  descripcion: string;
}

export interface CruceEspacialVenteo {
  id: string;
  deteccion_satelital: DeteccionSatelitalRaw;
  instalacion_sig?: InstalacionSigOficial;
  tipo_correlacion: TipoCorrelacionCatastral;
  match_catastral: boolean;
  distancia_metros_a_planta: number;
  tolerancia_catastral_m: number;
  vector_desvio?: VectorDesvioInstrumental;
  etiqueta_clasificacion: string;
  calificacion_posicionamiento: string;
  alerta_confusion_cargadero: boolean;
  estado_regulatorio: "Crítico" | "En Observación" | "Operativo";
  exceso_cupo_sen: boolean;
  porcentaje_exceso_cupo: number;
  emisiones_estimadas: {
    ch4_fugitivo_ton_ano: number;
    co2_ton_ano: number;
    so2_kg_dia: number;
    nox_kg_dia: number;
  };
  enlaces_inspeccion_hd: {
    google_maps_url: string;
    google_earth_url: string;
  };
}

/**
 * Calcula el rumbo geodésico y azimut entre dos coordenadas WGS84
 */
export function calcularRumboCardinal(
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): { rumbo: string; grados: number } {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const deg = (rad: number) => (rad * 180) / Math.PI;

  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  let bearing = (deg(Math.atan2(y, x)) + 360) % 360;

  const puntos = [
    "Norte (N)", "Nor-Noreste (NNE)", "Noreste (NE)", "Este-Noreste (ENE)",
    "Este (E)", "Este-Sudeste (ESE)", "Sudeste (SE)", "Sur-Sudeste (SSE)",
    "Sur (S)", "Sur-Sudoeste (SSW)", "Sudoeste (SW)", "Oeste-Sudoeste (WSW)",
    "Oeste (W)", "Oeste-Noroeste (WNW)", "Noroeste (NW)", "Nor-Noroeste (NNW)"
  ];
  const index = Math.round(bearing / 22.5) % 16;
  return { rumbo: puntos[index], grados: Math.round(bearing) };
}

/**
 * Ejecuta el Spatial Join Determinista para una detección satelital individual
 * contra un conjunto de instalaciones catastrales.
 */
export function resolverCruceEspacialIndividual(
  deteccion: DeteccionSatelitalRaw,
  instalaciones: InstalacionSigOficial[]
): CruceEspacialVenteo {
  // Asegurar que las coordenadas del satélite tengan el orden WGS84 correcto
  const { lat: satLat, lon: satLon } = normalizarCoordenadasCuenca(
    deteccion.latitud_satelital,
    deteccion.longitud_satelital
  );

  let mejorMatch: InstalacionSigOficial | undefined = undefined;
  let distanciaMinimaMetros = Infinity;

  for (const inst of instalaciones) {
    const { lat: instLat, lon: instLon } = normalizarCoordenadasCuenca(
      inst.latitud_oficial,
      inst.longitud_oficial
    );

    const dist = calcular_distancia_haversine(satLat, satLon, instLat, instLon);
    if (dist < distanciaMinimaMetros) {
      distanciaMinimaMetros = dist;
      mejorMatch = inst;
    }
  }

  const tolerancia = mejorMatch?.radio_tolerancia_metros || 400;

  // PREVENCIÓN ESTRICTA DE SALTOS:
  // Si la distancia supera la tolerancia, NO asociar a la planta.
  const esMatchCatastral = mejorMatch !== undefined && distanciaMinimaMetros <= tolerancia;

  const latStr = satLat.toFixed(5);
  const lonStr = satLon.toFixed(5);
  const googleMapsUrl = `https://www.google.com/maps/@${latStr},${lonStr},18z/data=!3m1!1e3`;
  const googleEarthUrl = `https://earth.google.com/web/@${latStr},${lonStr},600a,1200d,35y,0h,0t,0r`;

  let tipoCorrelacion: TipoCorrelacionCatastral = "ANOMALIA_NO_CATASTRADA";
  let etiquetaClasificacion = "";
  let calificacionPosicionamiento = "";
  let vectorDesvio: VectorDesvioInstrumental | undefined = undefined;
  let alertaConfusion = false;

  if (esMatchCatastral && mejorMatch) {
    tipoCorrelacion = "CORRELACION_OFICIAL_DIRECTA";
    const { rumbo, grados } = calcularRumboCardinal(
      mejorMatch.latitud_oficial,
      mejorMatch.longitud_oficial,
      satLat,
      satLon
    );

    vectorDesvio = {
      distancia_m: distanciaMinimaMetros,
      rumbo,
      grados,
      descripcion: `Vector de desvío instrumental: ${distanciaMinimaMetros} m hacia el ${rumbo} (azimut ${grados}°) respecto al punto de mensura oficial.`
    };

    etiquetaClasificacion = `Venteo / Foco Térmico en ${mejorMatch.nombre_oficial} (${mejorMatch.operador_oficial})`;
    calificacionPosicionamiento = `Match catastral confirmado: Detección a ${distanciaMinimaMetros}m de ${mejorMatch.codigo_sig} (tolerancia admisible: ±${tolerancia}m).`;
  } else {
    // Caso de anomalía no catastrada (permanece en su coordenada nativa satelital)
    tipoCorrelacion = "ANOMALIA_NO_CATASTRADA";
    const distKm = (distanciaMinimaMetros / 1000).toFixed(1);
    etiquetaClasificacion = `Anomalía Térmica No Catastrada - Coordenadas [${latStr}, ${lonStr}] - Detección ${deteccion.sensor.split(" (")[0]} - Sin pad registrado en radio de ${distKm} km`;
    calificacionPosicionamiento = `Alerta de campo independiente: Sin infraestructura catastrada en un radio de ${distKm} km (más cercana: ${mejorMatch?.denominacion_corta || "Ninguna"} a ${distKm} km). Requiere inspección óptica satelital HD o alta catastral.`;

    if (distanciaMinimaMetros <= 3500 && mejorMatch) {
      alertaConfusion = true;
    }
  }

  // Evaluación regulatoria (Resolución SEN 236/93 y Ley Neuquina 1875)
  const cupo = mejorMatch?.cupo_sen_m3d || 15000;
  const tasa = deteccion.tasa_quema_estimada_m3d;
  const excesoCupo = esMatchCatastral && tasa > cupo;
  const pctExceso = excesoCupo ? Math.round(((tasa - cupo) / cupo) * 100) : 0;

  let estado: "Crítico" | "En Observación" | "Operativo" = "Operativo";
  if (deteccion.es_venteo_frio || pctExceso > 30 || deteccion.eficiencia_combustion_est < 90 || (!esMatchCatastral && deteccion.frp_mw > 10)) {
    estado = "Crítico";
  } else if (excesoCupo || deteccion.eficiencia_combustion_est < 96 || !esMatchCatastral) {
    estado = "En Observación";
  }

  // Estimación AP-42
  const unburnedFrac = Math.max(0.005, (100 - deteccion.eficiencia_combustion_est) / 100);
  const ch4TonYear = deteccion.es_venteo_frio
    ? Math.round((tasa * 365 * 0.72 * 0.88) / 1000)
    : Math.round((tasa * 365 * 0.72 * 0.88 * unburnedFrac) / 1000);
  const co2TonYear = deteccion.es_venteo_frio
    ? 0
    : Math.round((tasa * 365 * 0.72 * (1 - unburnedFrac) * 2.75) / 1000);

  return {
    id: `cruce-${deteccion.id_deteccion}`,
    deteccion_satelital: {
      ...deteccion,
      latitud_satelital: satLat,
      longitud_satelital: satLon
    },
    instalacion_sig: esMatchCatastral ? mejorMatch : undefined,
    tipo_correlacion: tipoCorrelacion,
    match_catastral: esMatchCatastral,
    distancia_metros_a_planta: distanciaMinimaMetros,
    tolerancia_catastral_m: tolerancia,
    vector_desvio: vectorDesvio,
    etiqueta_clasificacion: etiquetaClasificacion,
    calificacion_posicionamiento: calificacionPosicionamiento,
    alerta_confusion_cargadero: alertaConfusion,
    estado_regulatorio: estado,
    exceso_cupo_sen: excesoCupo,
    porcentaje_exceso_cupo: pctExceso,
    emisiones_estimadas: {
      ch4_fugitivo_ton_ano: ch4TonYear,
      co2_ton_ano: co2TonYear,
      so2_kg_dia: Math.round(tasa * 0.0012),
      nox_kg_dia: Math.round(tasa * 0.0028)
    },
    enlaces_inspeccion_hd: {
      google_maps_url: googleMapsUrl,
      google_earth_url: googleEarthUrl
    }
  };
}
