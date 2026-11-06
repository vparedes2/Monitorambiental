/**
 * Geometrías reales desde OpenStreetMap (Overpass) para barridos y localidades.
 * Se usa desde el navegador (cada usuario consulta con su propia conexión, sin
 * el límite que Overpass aplica a los servidores en la nube) y desde el servidor
 * como respaldo.
 */

export interface ZonaBarrido {
  id: string;
  nombre: string;
  tipo: "rio" | "costa";
  referencia: { nombre: string; lat: number; lon: number };
  consulta: string;
}
export const ZONAS_BARRIDO: Record<string, ZonaBarrido> = {
  anelo: {
    id: "anelo", nombre: "Río Neuquén, zona Añelo", tipo: "rio",
    referencia: { nombre: "Añelo", lat: -38.352, lon: -68.789 },
    consulta: `way["waterway"="river"]["name"~"Neuqu",i](-38.75,-69.25,-37.95,-68.3);`
  },
  rincon: {
    id: "rincon", nombre: "Río Colorado, zona Rincón de los Sauces", tipo: "rio",
    referencia: { nombre: "Rincón de los Sauces", lat: -37.392, lon: -68.929 },
    consulta: `way["waterway"="river"]["name"~"Colorado",i](-37.8,-69.4,-37.0,-68.4);`
  },
  marimenuco: {
    id: "marimenuco", nombre: "Costa del lago Mari Menuco", tipo: "costa",
    referencia: { nombre: "Mari Menuco", lat: -38.58, lon: -68.62 },
    consulta: `nwr["natural"="water"]["name"~"Mari ?Menuco",i](-38.8,-69.0,-38.35,-68.3);nwr["landuse"="reservoir"]["name"~"Mari ?Menuco",i](-38.8,-69.0,-38.35,-68.3);nwr["water"="reservoir"]["name"~"Mari ?Menuco",i](-38.8,-69.0,-38.35,-68.3);`
  },
  barreales: {
    id: "barreales", nombre: "Costa del lago Los Barreales", tipo: "costa",
    referencia: { nombre: "Los Barreales", lat: -38.52, lon: -68.85 },
    consulta: `nwr["natural"="water"]["name"~"Barreales",i](-38.8,-69.2,-38.3,-68.5);nwr["landuse"="reservoir"]["name"~"Barreales",i](-38.8,-69.2,-38.3,-68.5);nwr["water"="reservoir"]["name"~"Barreales",i](-38.8,-69.2,-38.3,-68.5);`
  }
};

export const SERVIDORES_OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
export const consultarOverpass = async (q: string) => {
  let ultimo = "";
  for (const url of SERVIDORES_OVERPASS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(17000)
      });
      if (r.ok) return await r.json();
      ultimo = `HTTP ${r.status}`;
    } catch (e: any) {
      ultimo = e.message;
    }
  }
  throw new Error(`OpenStreetMap (Overpass) no respondió: ${ultimo}`);
};

export const lineasOsm = (d: any): { lat: number; lon: number }[][] => {
  const lineas: { lat: number; lon: number }[][] = [];
  for (const el of d.elements || []) {
    if (el.type === "way" && el.geometry) lineas.push(el.geometry);
    if (el.type === "relation") {
      for (const m of el.members || []) if (m.type === "way" && m.geometry && m.role !== "inner") lineas.push(m.geometry);
    }
  }
  return lineas;
};

export const muestrearRio = (lineas: { lat: number; lon: number }[][], ref: { lat: number; lon: number }) => {
  const kx = 111320 * Math.cos((ref.lat * Math.PI) / 180);
  const ky = 110540;
  const aXY = (p: { lat: number; lon: number }) => ({ x: (p.lon - ref.lon) * kx, y: (p.lat - ref.lat) * ky });
  const ways = lineas.filter((g) => g.length > 1).map((g) => g.map(aXY));
  if (!ways.length) throw new Error("No se encontró el cauce en OpenStreetMap.");

  // Unir tramos de OSM que comparten extremos en una sola línea continua (cauce principal)
  const usado = new Array(ways.length).fill(false);
  const distRef = (w: { x: number; y: number }[]) => Math.min(...w.map((p) => Math.hypot(p.x, p.y)));
  let semilla = 0;
  ways.forEach((w, k) => { if (distRef(w) < distRef(ways[semilla])) semilla = k; });
  usado[semilla] = true;
  let cadena = [...ways[semilla]];
  const extender = (alFinal: boolean) => {
    for (;;) {
      const ext = alFinal ? cadena[cadena.length - 1] : cadena[0];
      let mejor = -1, invertir = false, distMin = 250;
      ways.forEach((w, k) => {
        if (usado[k]) return;
        const dIni = Math.hypot(w[0].x - ext.x, w[0].y - ext.y);
        const dFin = Math.hypot(w[w.length - 1].x - ext.x, w[w.length - 1].y - ext.y);
        // al final de la cadena se engancha por el inicio del tramo; al comienzo, por su final
        const dDirecto = alFinal ? dIni : dFin;
        const dInvertido = alFinal ? dFin : dIni;
        if (dDirecto < distMin) { mejor = k; invertir = false; distMin = dDirecto; }
        if (dInvertido < distMin) { mejor = k; invertir = true; distMin = dInvertido; }
      });
      if (mejor < 0) return;
      usado[mejor] = true;
      let w = ways[mejor];
      if (invertir) w = [...w].reverse();
      cadena = alFinal ? cadena.concat(w.slice(1)) : w.slice(0, -1).concat(cadena);
    }
  };
  extender(true);
  extender(false);

  // Distancia acumulada a lo largo del cauce
  const acum = [0];
  for (let k = 1; k < cadena.length; k++) acum.push(acum[k - 1] + Math.hypot(cadena[k].x - cadena[k - 1].x, cadena[k].y - cadena[k - 1].y));
  let iRef = 0;
  cadena.forEach((p, k) => { if (Math.hypot(p.x, p.y) < Math.hypot(cadena[iRef].x, cadena[iRef].y)) iRef = k; });
  if (Math.hypot(cadena[iRef].x, cadena[iRef].y) > 30000) throw new Error("El cauce encontrado queda lejos de la localidad de referencia.");
  const puntoEn = (d: number) => {
    if (d < 0 || d > acum[acum.length - 1]) return null;
    let k = 1;
    while (k < acum.length && acum[k] < d) k++;
    const f = (d - acum[k - 1]) / ((acum[k] - acum[k - 1]) || 1);
    return { x: cadena[k - 1].x + (cadena[k].x - cadena[k - 1].x) * f, y: cadena[k - 1].y + (cadena[k].y - cadena[k - 1].y) * f };
  };
  // Sentido aguas abajo: los dos ríos corren de oeste a este
  const signo = cadena[cadena.length - 1].x >= cadena[0].x ? 1 : -1;
  const tramos: any[] = [];
  for (let k = -10; k < 10; k++) {
    const km = (k + 0.5) * 2;
    const p = puntoEn(acum[iRef] + signo * km * 1000);
    if (!p) continue;
    tramos.push({ lat: ref.lat + p.y / ky, lon: ref.lon + p.x / kx, km_desde_ref: km });
  }
  tramos.forEach((t, i) => { t.n = i + 1; });
  return tramos;
};

export const muestrearCosta = (lineas: { lat: number; lon: number }[][], n = 20) => {
  // Perímetro acumulado de todos los bordes exteriores
  const segs: { a: { lat: number; lon: number }; b: { lat: number; lon: number }; L: number }[] = [];
  let total = 0;
  for (const g of lineas) {
    for (let i = 0; i + 1 < g.length; i++) {
      const kx = 111320 * Math.cos((g[i].lat * Math.PI) / 180);
      const L = Math.hypot((g[i + 1].lon - g[i].lon) * kx, (g[i + 1].lat - g[i].lat) * 110540);
      segs.push({ a: g[i], b: g[i + 1], L });
      total += L;
    }
  }
  if (total < 2000) throw new Error("No se encontró la costa del embalse en OpenStreetMap.");
  const paso = total / n;
  const out: any[] = [];
  let acum = 0, objetivo = paso / 2, j = 0;
  for (const s of segs) {
    while (objetivo <= acum + s.L && j < n) {
      const f = (objetivo - acum) / (s.L || 1);
      out.push({ n: ++j, lat: s.a.lat + (s.b.lat - s.a.lat) * f, lon: s.a.lon + (s.b.lon - s.a.lon) * f, km_costa: Math.round(objetivo / 100) / 10 });
      objetivo += paso;
    }
    acum += s.L;
  }
  return { puntos: out, perimetro_km: Math.round(total / 100) / 10 };
};


export async function obtenerBarrido(zonaId: string) {
  const zona = ZONAS_BARRIDO[zonaId];
  if (!zona) throw new Error(`Zona desconocida: ${zonaId}`);
  const lineas = lineasOsm(await consultarOverpass(`[out:json][timeout:25];(${zona.consulta});out geom;`));
  let datos: any;
  if (zona.tipo === "rio") {
    datos = { tramos: muestrearRio(lineas, zona.referencia) };
  } else {
    const { puntos, perimetro_km } = muestrearCosta(lineas, 20);
    datos = { tramos: puntos, perimetro_km };
  }
  return {
    zona: zona.id, nombre: zona.nombre, tipo: zona.tipo, referencia: zona.referencia, radio_m: 1000,
    fuente: `${zona.tipo === "rio" ? "Cauce" : "Costa"}: OpenStreetMap (© colaboradores de OpenStreetMap, ODbL)`,
    ...datos
  };
}

export const NOMBRES_LOCALIDADES = ["Añelo", "Tratay[eé]n", "Sauzal Bonito", "San Patricio del Cha[ñn]ar", "Rinc[oó]n de los Sauces", "Neuquén", "Centenario", "Vista Alegre Norte", "Vista Alegre Sur", "Plottier", "Cutral Có", "Plaza Huincul", "Octavio Pico", "Barrancas", "Buta Ranquil", "Senillosa", "Cinco Saltos", "Catriel", "Chos Malal", "Paso Aguerre"];

export async function obtenerLocalidades() {
  const patron = NOMBRES_LOCALIDADES.join("|");
  const q = `[out:json][timeout:25];node["place"~"city|town|village|hamlet|locality|suburb"]["name"~"^(${patron})$",i](-39.4,-70.6,-36.7,-67.6);out;`;
  const d: any = await consultarOverpass(q);
  const vistos = new Set<string>();
  const localidades = (d.elements || [])
    .filter((e: any) => { const k = e.tags?.name; if (!k || vistos.has(k)) return false; vistos.add(k); return true; })
    .map((e: any) => ({
      nombre: e.tags.name,
      lat: e.lat,
      lon: e.lon,
      poblacion: Number(String(e.tags.population || "").replace(/\D/g, "")) || null,
      tipo: e.tags.place
    }));
  return { fuente: "OpenStreetMap (© colaboradores de OpenStreetMap, ODbL)", localidades };
}

/** En el navegador: usa caché local de 7 días, luego OSM directo y por último el servidor */
export async function conCache<T>(clave: string, obtener: () => Promise<T>, respaldo: () => Promise<T>): Promise<T> {
  const k = `osm-cache-${clave}`;
  try {
    const c = JSON.parse(localStorage.getItem(k) || "null");
    if (c && Date.now() - c.t < 7 * 86400000) return c.data;
  } catch { /* sin almacenamiento */ }
  let data: T;
  try {
    data = await obtener();
  } catch {
    data = await respaldo();
  }
  try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), data })); } catch { /* */ }
  return data;
}
