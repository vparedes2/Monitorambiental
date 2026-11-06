import { FechaAnomaliaValidacion } from "../types";

/**
 * Validador de Coherencia Temporal Satelital
 * Implementa la función enviada por el usuario:
 * 
 * def validar_fecha_anomalia(registro_software):
 *     fecha_satelite_str = registro_software.get("ultima_deteccion_satelital", {}).get("fecha")
 *     fecha_sistema_str = registro_software.get("fecha_registro_sistema")
 *     if not fecha_satelite_str:
 *         return False, "Error: El satélite no proporcionó una fecha de adquisición válida."
 *     if fecha_satelite_str != fecha_sistema_str:
 *         return False, f"Alerta de inconsistencia: Los datos pertenecen al {fecha_satelite_str} pero se procesaron como {fecha_sistema_str}."
 *     return True, f"Validación de fecha correcta para el evento del {fecha_satelite_str}."
 */

export interface RegistroSoftwareSatelital {
  ultima_deteccion_satelital?: {
    fecha?: string | null;
    sensor?: string;
    resolucion_m?: number;
    [key: string]: any;
  } | null;
  fecha_registro_sistema?: string | null;
  [key: string]: any;
}

export function validarFechaAnomalia(registro_software: RegistroSoftwareSatelital): FechaAnomaliaValidacion {
  // Extraer la fecha del JSON de la API del satélite
  const ultimaDeteccion = registro_software?.ultima_deteccion_satelital || {};
  let fecha_satelite_str = ultimaDeteccion.fecha;
  let fecha_sistema_str = registro_software?.fecha_registro_sistema;

  // Normalizar strings si vienen con timestamp ISO (ej: "2026-11-05T14:30:00Z" -> "2026-11-05")
  if (typeof fecha_satelite_str === "string" && fecha_satelite_str.includes("T")) {
    fecha_satelite_str = fecha_satelite_str.split("T")[0];
  }
  if (typeof fecha_sistema_str === "string" && fecha_sistema_str.includes("T")) {
    fecha_sistema_str = fecha_sistema_str.split("T")[0];
  }

  // 1. Validar que exista fecha de adquisición satelital
  if (!fecha_satelite_str || typeof fecha_satelite_str !== "string" || !fecha_satelite_str.trim()) {
    return {
      valido: false,
      mensaje: "Error: El satélite no proporcionó una fecha de adquisición válida.",
      fecha_satelite: undefined,
      fecha_sistema: fecha_sistema_str || undefined
    };
  }

  // 2. Validar que exista fecha de registro del sistema
  if (!fecha_sistema_str) {
    return {
      valido: false,
      mensaje: `Alerta de inconsistencia: Los datos pertenecen al ${fecha_satelite_str} pero no se registró fecha en el sistema.`,
      fecha_satelite: fecha_satelite_str,
      fecha_sistema: undefined
    };
  }

  // 3. Validar que los datos correspondan al día del procesamiento
  if (fecha_satelite_str !== fecha_sistema_str) {
    return {
      valido: false,
      mensaje: `Alerta de inconsistencia: Los datos pertenecen al ${fecha_satelite_str} pero se procesaron como ${fecha_sistema_str}.`,
      fecha_satelite: fecha_satelite_str,
      fecha_sistema: fecha_sistema_str
    };
  }

  // 4. Éxito
  return {
    valido: true,
    mensaje: `Validación de fecha correcta para el evento del ${fecha_satelite_str}.`,
    fecha_satelite: fecha_satelite_str,
    fecha_sistema: fecha_sistema_str
  };
}

/**
 * Casos de prueba estándar para verificación
 */
export const CASOS_DE_PRUEBA_FECHA = [
  {
    nombre: "Caso 1: Coherencia perfecta (Mismo día 2026-11-05)",
    registro: {
      ultima_deteccion_satelital: { fecha: "2026-11-05", sensor: "Sentinel-2 MSI" },
      fecha_registro_sistema: "2026-11-05"
    },
    esperadoValido: true
  },
  {
    nombre: "Caso 2: Inconsistencia temporal (Satélite 2026-11-04 vs Sistema 2026-11-05)",
    registro: {
      ultima_deteccion_satelital: { fecha: "2026-11-04", sensor: "VIIRS Day/Night" },
      fecha_registro_sistema: "2026-11-05"
    },
    esperadoValido: false
  },
  {
    nombre: "Caso 3: Satélite sin fecha (Metadata corrupta o nula)",
    registro: {
      ultima_deteccion_satelital: { fecha: null, sensor: "Landsat-9 OLI" },
      fecha_registro_sistema: "2026-11-05"
    },
    esperadoValido: false
  }
];
