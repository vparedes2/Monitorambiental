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

export const SERVIDORES_OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.jp/api/interpreter"
];
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
      if (r.ok) {
        const j = await r.json();
        if ((j.elements || []).length) return j;
        ultimo = j.remark || "respuesta vacía";
        continue;
      }
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
  const ways = lineas.filter((g) => g.length > 1).map((g) => g.map((p) => ({ x: (p.lon - ref.lon) * kx, y: (p.lat - ref.lat) * ky })));
  if (!ways.length) throw new Error("No se encontró el cauce en OpenStreetMap.");

  // Red de vértices: los consecutivos se unen y los extremos de tramos distintos se enganchan si están a menos de 300 m.
  // Así se tolera un cauce cortado en pedazos o con brazos (como el del IGN).
  const nodos: { x: number; y: number }[] = [];
  const ady: Map<number, number>[] = [];
  const clave = new Map<string, number>();
  const nodo = (p: { x: number; y: number }) => {
    const k = `${Math.round(p.x / 5)}:${Math.round(p.y / 5)}`;
    let i = clave.get(k);
    if (i === undefined) { i = nodos.length; nodos.push(p); ady.push(new Map()); clave.set(k, i); }
    return i;
  };
  const unir = (a: number, b: number) => {
    if (a === b) return;
    const d = Math.hypot(nodos[a].x - nodos[b].x, nodos[a].y - nodos[b].y);
    if (!ady[a].has(b) || ady[a].get(b)! > d) { ady[a].set(b, d); ady[b].set(a, d); }
  };
  const extremos: number[] = [];
  for (const w of ways) {
    let prev = nodo(w[0]); extremos.push(prev);
    for (let k = 1; k < w.length; k++) { const i = nodo(w[k]); unir(prev, i); prev = i; }
    extremos.push(prev);
  }
  for (let a = 0; a < extremos.length; a++)
    for (let b = a + 1; b < extremos.length; b++) {
      const A = nodos[extremos[a]], B = nodos[extremos[b]];
      if (Math.hypot(A.x - B.x, A.y - B.y) < 300) unir(extremos[a], extremos[b]);
    }

  // Camino más corto desde el punto del cauce más cercano a la localidad (Dijkstra simple)
  let origen = 0;
  nodos.forEach((p, i) => { if (Math.hypot(p.x, p.y) < Math.hypot(nodos[origen].x, nodos[origen].y)) origen = i; });
  if (Math.hypot(nodos[origen].x, nodos[origen].y) > 30000) throw new Error("El cauce encontrado queda lejos de la localidad de referencia.");
  const dist = new Float64Array(nodos.length).fill(Infinity), previo = new Int32Array(nodos.length).fill(-1), hecho = new Uint8Array(nodos.length);
  dist[origen] = 0;
  const cola: [number, number][] = [[0, origen]];
  while (cola.length) {
    let m = 0;
    for (let k = 1; k < cola.length; k++) if (cola[k][0] < cola[m][0]) m = k;
    const [d, u] = cola.splice(m, 1)[0];
    if (hecho[u]) continue;
    hecho[u] = 1;
    if (d > 26000) continue;
    for (const [v, w] of ady[u]) if (d + w < dist[v]) { dist[v] = d + w; previo[v] = u; cola.push([d + w, v]); }
  }
  // Extremo más lejano hacia el oeste (aguas arriba) y hacia el este (aguas abajo): los dos ríos corren de oeste a este
  const lejos = (lado: number) => {
    let mejor = origen, val = -Infinity;
    nodos.forEach((p, i) => {
      if (!isFinite(dist[i]) || Math.sign(p.x - nodos[origen].x) !== lado) return;
      const v = Math.min(dist[i], 26000) * 10 + lado * (p.x - nodos[origen].x) / 1000;
      if (v > val) { val = v; mejor = i; }
    });
    const camino: number[] = [];
    for (let i = mejor; i !== -1; i = previo[i]) camino.push(i);
    return camino.reverse(); // de origen al extremo
  };
  const arriba = lejos(-1), abajo = lejos(1);
  const cadena = [...arriba.reverse(), ...abajo.slice(1)].map((i) => nodos[i]);
  const iRef = arriba.length - 1;

  const acum = [0];
  for (let k = 1; k < cadena.length; k++) acum.push(acum[k - 1] + Math.hypot(cadena[k].x - cadena[k - 1].x, cadena[k].y - cadena[k - 1].y));
  const puntoEn = (d: number) => {
    if (d < 0 || d > acum[acum.length - 1]) return null;
    let k = 1;
    while (k < acum.length && acum[k] < d) k++;
    const f = (d - acum[k - 1]) / ((acum[k] - acum[k - 1]) || 1);
    return { x: cadena[k - 1].x + (cadena[k].x - cadena[k - 1].x) * f, y: cadena[k - 1].y + (cadena[k].y - cadena[k - 1].y) * f };
  };
  const tramos: any[] = [];
  for (let k = -10; k < 10; k++) {
    const km = (k + 0.5) * 2;
    const p = puntoEn(acum[iRef] + km * 1000);
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

/** Trazado fijo guardado en el sitio (los cauces y costas no cambian); evita depender de Overpass en vivo */
export async function barridoFijo(zonaId: string) {
  const r = await fetch(`/capas/barrido-${zonaId}.json`);
  if (!r.ok) throw new Error("sin trazado fijo");
  return r.json();
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
