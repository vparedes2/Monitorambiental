/**
 * Inyección de agua declarada por las operadoras a la Secretaría de Energía (Capítulo IV),
 * para los sumideros de Neuquén. Archivo fijo del sitio (public/capas/inyeccion-sumideros.json),
 * se regenera cuando se baja una versión nueva del dataset nacional.
 */
import { useEffect, useState } from "react";

export interface InyPozo { sigla: string; empresa: string; tipo: string; estado: string; m3: (number | null)[]; prov: boolean; inicio_perf?: string | null; fin_term?: string | null; abandono?: string | null }
export interface InyDatos { fuente: string; descargado: string; desde: string; hasta: string; pozos: Record<string, InyPozo> }

export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

let cache: Promise<InyDatos | null> | null = null;
export function useInyeccion() {
  const [d, setD] = useState<InyDatos | null>(null);
  useEffect(() => {
    cache ??= fetch("/capas/inyeccion-sumideros.json").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    cache.then(setD);
  }, []);
  return d;
}

export type AvisoIny = "inyecta" | "dejo" | "activo_sin" | "inactivo" | "otro";

/** Resumen de un pozo: último mes con inyección, totales y si lo declarado es coherente */
const norm = (x: string) => x.trim().toUpperCase();

export function leerIny(p: InyPozo, datos: InyDatos) {
  const [anio, mesIni] = datos.desde.split("-").map(Number);
  const nombreMes = (i: number) => `${MESES[(mesIni - 1 + i) % 12]} ${anio}`;
  let ult = -1;
  p.m3.forEach((v, i) => { if ((v ?? 0) > 0) ult = i; });
  const total = p.m3.reduce<number>((s, v) => s + (v ?? 0), 0);
  const n = p.m3.length;
  const diasMes = (i: number) => new Date(anio, mesIni + i, 0).getDate();
  const ultimoDia = ult >= 0 ? Math.round((p.m3[ult] ?? 0) / diasMes(ult)) : 0;
  const efectivo = /Inyección Efectiva/i.test(p.estado);
  // Un mismo pozo puede tener más de un registro en Nación (reentradas, ramas): si otro registro
  // del mismo pozo declara la inyección, el 0 de este no es una inconsistencia
  const hermano = ult < 0 ? Object.values(datos.pozos).find((q) => q !== p && norm(q.sigla) === norm(p.sigla) && q.m3.some((v) => (v ?? 0) > 0)) : undefined;
  let aviso: AvisoIny;
  if (hermano) aviso = "otro";
  else if (ult >= n - 2) aviso = "inyecta";
  else if (ult >= 0) aviso = "dejo";
  else aviso = efectivo ? "activo_sin" : "inactivo";
  const texto: Record<AvisoIny, string> = {
    inyecta: "Declara inyección al día.",
    otro: "Este registro está en 0, pero la inyección del pozo se declara en otro registro con la misma sigla.",
    dejo: `Dejó de declarar inyección después de ${ult >= 0 ? nombreMes(ult) : "?"}.`,
    activo_sin: "Figura en inyección efectiva pero declara 0 m³ todo el año: revisar.",
    inactivo: `Sin inyección en ${anio} (estado declarado: ${p.estado.toLowerCase()}).`
  };
  return { ultimoMes: ult >= 0 ? nombreMes(ult) : null, total, ultimoDia, aviso, texto: texto[aviso], nombreMes };
}

/** Marca de coherencia para tablas y mapas */
export const COHERENCIA: Record<AvisoIny | "sin_nacion", { nombre: string; color: string; orden: number }> = {
  activo_sin: { nombre: "Revisar: activo con 0 m³", color: "#FF4D6D", orden: 0 },
  dejo: { nombre: "Dejó de declarar", color: "#FFC857", orden: 1 },
  inyecta: { nombre: "Declara al día", color: "#7BD88F", orden: 2 },
  otro: { nombre: "Declara en otro registro", color: "#A9D8B0", orden: 3 },
  inactivo: { nombre: "Inactivo, sin inyección", color: "#8B8172", orden: 4 },
  sin_nacion: { nombre: "Sin datos en Nación", color: "#5C554C", orden: 5 }
};
