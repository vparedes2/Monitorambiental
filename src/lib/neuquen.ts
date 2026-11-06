import { useEffect, useState } from "react";

/**
 * Capas oficiales del SIG de Hidrocarburos de la Provincia del Neuquén
 * (Subsecretaría de Energía), servidas por /api/neuquen/... con caché local.
 */
export const FUENTE_NQN = "SIG Hidrocarburos, Subsecretaría de Energía de la Provincia del Neuquén";
export const URL_SIG_NQN = "https://hidrocarburos.energianeuquen.gob.ar";

export interface Instalacion {
  id: string | null; nombre: string | null; sigla: string | null; tipo: string | null; area: string | null; operador: string | null;
  estado: string | null; venteo: string | null; sistema_venteo: string | null; stack_frio: string | null; vru: string | null;
  gas_diseno: number | null; gas_actual: number | null; petroleo_diseno: number | null; petroleo_actual: number | null;
  tanques: number | null; acta: string | null; observaciones: string | null;
  lat: number; lon: number;
}
export interface Sumidero {
  nombre: string | null; estado: string | null; operador: string | null; area: string | null; yacimiento: string | null;
  formacion: string | null; anio: number | null; profundidad_m: number | null; lat: number; lon: number;
}
export interface VenteoAutorizado {
  expediente: string | null; empresa: string | null; area: string | null; instalacion: string | null; motivo: string | null;
  disposicion: string | null; permiso: string | null; inicio: string | null; vencimiento: string | null;
  m3_dia_autorizado: number | null; lat: number; lon: number;
}

const LS = "sig-nqn-v1-";
const DIA = 86400000;

async function capa<T>(nombre: string, mapa: (p: any, c: [number, number]) => T): Promise<{ items: T[]; consultado: string | null; geojson: any }> {
  try {
    const raw = localStorage.getItem(LS + nombre);
    if (raw) {
      const c = JSON.parse(raw);
      if (Date.now() - c.t < DIA) return c.v;
    }
  } catch { /* sin almacenamiento */ }
  const r = await fetch(`/api/neuquen/capa/${nombre}`);
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  const items = (d.features || [])
    .filter((f: any) => f.geometry?.type === "Point")
    .map((f: any) => mapa(f.properties, f.geometry.coordinates));
  const v = { items, consultado: d.consultado_utc ?? null, geojson: { type: "FeatureCollection", features: d.features } };
  try { localStorage.setItem(LS + nombre, JSON.stringify({ t: Date.now(), v })); } catch { /* cuota llena */ }
  return v;
}

export function useSigNeuquen() {
  const [instalaciones, setInst] = useState<Instalacion[]>([]);
  const [venteos, setVent] = useState<VenteoAutorizado[]>([]);
  const [ductos, setDuctos] = useState<any>(null);
  const [areas, setAreas] = useState<any>(null);
  const [sumideros, setSumideros] = useState<Sumidero[]>([]);
  const [consultado, setConsultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    Promise.allSettled([
      capa<Instalacion>("instalaciones", (p, c) => ({ ...p, lon: c[0], lat: c[1] })),
      capa<VenteoAutorizado>("venteos", (p, c) => ({ ...p, lon: c[0], lat: c[1] })),
      capa<any>("ductos", (p) => p),
      capa<any>("areas", (p) => p),
      capa<Sumidero>("sumideros", (p, c) => ({ ...p, lon: c[0], lat: c[1] }))
    ]).then(([i, v, d, a, s]) => {
      if (!vivo) return;
      if (i.status === "fulfilled") { setInst(i.value.items); setConsultado(i.value.consultado); }
      if (v.status === "fulfilled") setVent(v.value.items);
      if (d.status === "fulfilled") setDuctos(d.value.geojson);
      if (a.status === "fulfilled") setAreas(a.value.geojson);
      if (s.status === "fulfilled") setSumideros(s.value.items);
      const fallo = [i, v].find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
      if (fallo) setError(String(fallo.reason?.message || fallo.reason));
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  return { instalaciones, venteos, ductos, areas, sumideros, consultado, error, cargando };
}

// ---------------------------------------------------------------------------
// Cruce foco térmico ↔ instalaciones declaradas
// ---------------------------------------------------------------------------
export const TOLERANCIA_M = 1000;

export const distM = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const masCercano = <T extends { lat: number; lon: number }>(lat: number, lon: number, lista: T[]) => {
  let mejor: T | null = null, d = Infinity;
  for (const x of lista) {
    if (Math.abs(x.lat - lat) > 0.1 || Math.abs(x.lon - lon) > 0.13) continue;
    const dd = distM(lat, lon, x.lat, x.lon);
    if (dd < d) { d = dd; mejor = x; }
  }
  return mejor ? { item: mejor, distancia: d } : null;
};

export const vigente = (v: VenteoAutorizado, hoy = new Date()) => !v.vencimiento || new Date(v.vencimiento) >= hoy;

const enAnillo = (x: number, y: number, r: number[][]) => {
  let dentro = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
};
/** Área hidrocarburífera de Neuquén que contiene el punto, si hay */
export function areaDe(lat: number, lon: number, areas: any): any | null {
  for (const f of areas?.features || []) {
    const g = f.geometry;
    const pols = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
    for (const pol of pols) {
      if (pol[0] && enAnillo(lon, lat, pol[0]) && !pol.slice(1).some((h: number[][]) => enAnillo(lon, lat, h))) return f.properties;
    }
  }
  return null;
}

export type Clase = "autorizado" | "vencido" | "instalacion" | "fuera" | "sin_registro";
export const CLASES: Record<Clase, { nombre: string; color: string; detalle: string }> = {
  autorizado: { nombre: "Venteo autorizado vigente", color: "#7BD88F", detalle: "A menos de 1 km de un venteo con permiso vigente" },
  vencido: { nombre: "Permiso de venteo vencido", color: "#FFC857", detalle: "A menos de 1 km de un venteo cuyo permiso ya venció" },
  instalacion: { nombre: "Instalación sin permiso de venteo registrado", color: "#FF8A3D", detalle: "A menos de 1 km de una instalación declarada, sin venteo autorizado en el registro" },
  fuera: { nombre: "Dentro de un área, lejos de instalaciones", color: "#FF4D6D", detalle: "Dentro de un área hidrocarburífera de Neuquén, sin instalación ni venteo declarado a menos de 1 km" },
  sin_registro: { nombre: "Fuera del registro de Neuquén", color: "#8BA0B6", detalle: "Fuera de las áreas hidrocarburíferas de Neuquén (otra provincia o zona sin concesión): el registro provincial no lo cubre" }
};

export interface Clasificacion {
  clase: Clase;
  venteo?: { item: VenteoAutorizado; distancia: number } | null;
  instalacion?: { item: Instalacion; distancia: number } | null;
  area?: any | null;
}

export function clasificarFoco(lat: number, lon: number, instalaciones: Instalacion[], venteos: VenteoAutorizado[], areas?: any): Clasificacion {
  const v = masCercano(lat, lon, venteos);
  const i = masCercano(lat, lon, instalaciones);
  const area = areas ? areaDe(lat, lon, areas) : null;
  if (v && v.distancia <= TOLERANCIA_M) return { clase: vigente(v.item) ? "autorizado" : "vencido", venteo: v, instalacion: i, area };
  if (i && i.distancia <= TOLERANCIA_M) return { clase: "instalacion", venteo: v, instalacion: i, area };
  return { clase: areas && !area ? "sin_registro" : "fuera", venteo: v, instalacion: i, area };
}

/** Estado de cada venteo autorizado según si hubo calor detectado cerca */
export function estadoVenteos(venteos: VenteoAutorizado[], focos: { lat: number; lon: number; frp: number; fecha: string }[]) {
  return venteos.map((v) => {
    const cerca = focos.filter((f) => Math.abs(f.lat - v.lat) < 0.02 && Math.abs(f.lon - v.lon) < 0.025 && distM(f.lat, f.lon, v.lat, v.lon) <= TOLERANCIA_M);
    return {
      venteo: v,
      vigente: vigente(v),
      detecciones: cerca.length,
      frpMax: cerca.reduce((a, f) => Math.max(a, f.frp), 0),
      ultima: cerca.map((f) => f.fecha).sort().pop() ?? null
    };
  });
}

/** Color por tipo de instalación */
export function colorTipo(tipo: string | null): string {
  const t = (tipo || "").toLowerCase();
  if (/gas|acondicion|ptg|compres/.test(t)) return "#8FE3F0";
  if (/crudo|ptc|petr/.test(t)) return "#C9A46A";
  if (/bater|usp|epf|separ/.test(t)) return "#E8EEF4";
  if (/agua|inyec|sumid|pia|ptas/.test(t)) return "#5AA9FF";
  return "#B48CFF";
}
