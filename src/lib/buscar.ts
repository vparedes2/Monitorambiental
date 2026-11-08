/**
 * Búsqueda por partes (no exacta) de pozos, plantas y áreas de Neuquén.
 * "adv x1 sumidero del orejano" encuentra TEC.Nq.ADV.x-1 en El Orejano aunque no sea un sumidero:
 * cada palabra suma puntos según dónde aparece y se devuelven los candidatos ordenados.
 */
import { useEffect, useState } from "react";

export const normalizar = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const compactar = (s: string) => normalizar(s).replace(/ /g, "");
const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "en", "y", "pozo", "pozos", "area", "planta", "yacimiento"]);
const PISTAS_TIPO: Record<string, string> = { sumidero: "S", sumideros: "S", swd: "S", inyector: "IA", inyeccion: "IA", gas: "G", gasifero: "G", petrolero: "P", petrolifero: "P", acuifero: "A" };

export interface Candidato { clave: string; codigo: string; texto: string; tipo?: string; activo?: boolean }
export interface Indexado<T> { item: T; codigo: string; texto: string; tipo?: string; activo: boolean }

export const indexar = <T,>(items: T[], f: (x: T) => Omit<Candidato, "clave">): Indexado<T>[] =>
  items.map((item) => { const c = f(item); return { item, codigo: compactar(c.codigo), texto: normalizar(c.texto), tipo: c.tipo, activo: c.activo ?? true }; });

/** Devuelve los mejores candidatos; cada palabra suma más si aparece en la sigla o código */
export function buscarPorPartes<T>(idx: Indexado<T>[], consulta: string, max = 12) {
  const palabras = normalizar(consulta).split(" ").filter((p) => p && !VACIAS.has(p));
  if (!palabras.length) return [];
  const tipoPista = palabras.map((p) => PISTAS_TIPO[p]).find(Boolean);
  const utiles = palabras.filter((p) => !PISTAS_TIPO[p]);
  const junto = utiles.join("");
  const necesarias = Math.max(1, Math.ceil(utiles.length / 2));
  const res: { r: Indexado<T>; puntos: number }[] = [];
  for (const r of idx) {
    let puntos = 0, acertadas = 0, enCodigo = 0;
    for (const p of utiles) {
      if (r.codigo.includes(p)) { puntos += p.length >= 2 ? 3 : 1; acertadas++; enCodigo++; }
      else if (r.texto.includes(p)) { puntos += 1.5; acertadas++; }
    }
    if (junto.length >= 3 && r.codigo.includes(junto)) puntos += 5;
    if (acertadas < necesarias && !(junto.length >= 3 && r.codigo.includes(junto))) continue;
    if (enCodigo === 0 && utiles.length > 1 && acertadas < utiles.length) continue;
    if (tipoPista && r.tipo === tipoPista) puntos += 1;
    if (r.activo) puntos += 0.3;
    res.push({ r, puntos });
  }
  return res.sort((a, b) => b.puntos - a.puntos).slice(0, max).map((x) => x.r.item);
}

/** Índice de los 19.657 pozos de Neuquén (padrón Capítulo IV de Nación), se baja al primer uso */
export type PozoIdx = [string, number, string, string, string, string, number, number];
let pozosPromesa: Promise<{ tipos: Record<string, string>; pozos: PozoIdx[] }> | null = null;
export function usePozosNeuquen(activar: boolean) {
  const [d, setD] = useState<{ tipos: Record<string, string>; pozos: PozoIdx[] } | null>(null);
  useEffect(() => {
    if (!activar) return;
    pozosPromesa ??= fetch("/capas/pozos-neuquen.json").then((r) => r.json());
    pozosPromesa.then(setD).catch(() => { pozosPromesa = null; });
  }, [activar]);
  return d;
}
