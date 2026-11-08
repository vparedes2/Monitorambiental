import React, { useEffect, useMemo, useRef, useState } from "react";
import { useInyeccion, leerIny, COHERENCIA, type InyPozo, type InyDatos } from "../lib/inyeccion";
import { useSesion } from "../lib/sesion";
import { areaDe, distM } from "../lib/neuquen";
import { indexar, buscarPorPartes, usePozosNeuquen, type PozoIdx } from "../lib/buscar";
import type { Map as MLMap } from "maplibre-gl";
import type maplibregl from "maplibre-gl";
import { motion, AnimatePresence } from "motion/react";
import { FileDown, Search, X } from "lucide-react";
import Globo, { setGeo, enfocar } from "../components/Globo";
import { capturarMapa, generarInformePDF, descargarTexto, nombreArchivo, type ItemLeyenda } from "../lib/exportar";
import {
  useSigNeuquen, clasificarFoco, estadoVenteos, colorTipo, CLASES, FUENTE_NQN, URL_SIG_NQN, TOLERANCIA_M,
  type Clase, type Clasificacion
} from "../lib/neuquen";

interface Foco { id: string; lat: number; lon: number; frp: number; fecha: string; sensor: string; confianza?: number }

const CAPAS = [
  { id: "focos", nombre: "Focos FIRMS (cruce)", color: "#FF8A3D" },
  { id: "instalaciones", nombre: "Instalaciones", color: "#EEE7DB" },
  { id: "venteos", nombre: "Venteos autorizados", color: "#7BD88F" },
  { id: "sumideros", nombre: "Pozos sumideros", color: "#5AA9FF" },
  { id: "sumnac", nombre: "Sumideros solo en registro nacional", color: "#B9DCFF" },
  { id: "ductos", nombre: "Ductos troncales", color: "#C9A46A" },
  { id: "areas", nombre: "Áreas y concesiones", color: "#8FE3F0" },
  { id: "locaciones", nombre: "Locaciones (zoom 11+)", color: "#B48CFF" },
  { id: "pozos", nombre: "Todos los pozos (zoom 11+)", color: "#FFFFFF" },
  { id: "traza", nombre: "Traza SB-12", color: "#FF4D6D" }
] as const;
type IdCapa = typeof CAPAS[number]["id"];

/** Permiso que habilita cada capa (las que no figuran se ven con solo tener la pantalla) */
const PERMISO_CAPA: Partial<Record<string, string>> = {
  venteos: "instalaciones.venteos", sumideros: "instalaciones.sumideros", sumnac: "instalaciones.nacion",
  ductos: "instalaciones.infra", areas: "instalaciones.infra", locaciones: "instalaciones.infra", pozos: "instalaciones.infra", traza: "instalaciones.infra"
};
const VIS_LS = "capas-instalaciones-v1";
const visInicial = (): Record<IdCapa, boolean> => {
  const base = { focos: true, instalaciones: true, venteos: true, sumideros: true, sumnac: true, ductos: true, areas: true, locaciones: false, pozos: false, traza: true } as Record<IdCapa, boolean>;
  try { return { ...base, ...JSON.parse(localStorage.getItem(VIS_LS) || "{}") }; } catch { return base; }
};

const CAPAS_MAP: Record<IdCapa, string[]> = {
  focos: ["x-focos-halo", "x-focos"],
  instalaciones: ["x-inst"],
  venteos: ["x-vent"],
  sumideros: ["x-sum"],
  sumnac: ["x-sumn"],
  ductos: ["x-ductos"],
  areas: ["x-areas-linea", "x-areas-rotulo"],
  locaciones: ["x-wms-Locaciones"],
  pozos: ["x-wms-Pozos"],
  traza: ["x-traza"]
};

const LEYENDA: ItemLeyenda[] = [
  ...(Object.keys(CLASES) as Clase[]).map((k) => ({ color: CLASES[k].color, texto: `Foco: ${CLASES[k].nombre}`, forma: "circulo" as const })),
  { color: "#7BD88F", texto: "Venteo autorizado (registro provincial)", forma: "circulo" },
  { color: "#5AA9FF", texto: "Pozo sumidero", forma: "cuadro" },
  { color: "#C9A46A", texto: "Ducto troncal", forma: "linea" }
];

type Seleccion = { tipo: string; titulo: string; datos: [string, string | number | null | undefined][]; lat: number; lon: number; idNacion?: string | null; fecha?: string };

export default function Instalaciones() {
  const sig = useSigNeuquen();
  const mapRef = useRef<MLMap | null>(null);
  const [listo, setListo] = useState(false);
  const [dias, setDias] = useState(2);
  const [focos, setFocos] = useState<Foco[]>([]);
  const [estadoFirms, setEstadoFirms] = useState<string>("cargando");
  const { puede } = useSesion();
  const capaOk = (id: string) => !PERMISO_CAPA[id] || puede(PERMISO_CAPA[id]!);
  const capasPermitidas = CAPAS.filter((c) => capaOk(c.id)).map((c) => c.id).join(",");
  const [vis, setVis] = useState(visInicial);
  const [sel, setSel] = useState<Seleccion | null>(null);
  const iny = useInyeccion();
  const nacionRef = useRef<any>(null);
  const [nacionListo, setNacionListo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [operador, setOperador] = useState("todas");
  const [filtroVent, setFiltroVent] = useState<"todos" | "detectado" | "sin" | "vencido">("todos");
  const [traza, setTraza] = useState<any>(null);

  useEffect(() => { try { localStorage.setItem(VIS_LS, JSON.stringify(vis)); } catch { /* */ } }, [vis]);

  useEffect(() => {
    let vivo = true;
    setEstadoFirms("cargando");
    fetch(`/api/firms?dias=${dias}`).then((r) => r.json()).then((d) => {
      if (!vivo) return;
      setFocos(d.focos || []);
      setEstadoFirms(d.estado);
    }).catch(() => vivo && setEstadoFirms("error"));
    return () => { vivo = false; };
  }, [dias]);

  useEffect(() => { fetch("/capas/traza-sb12.geojson").then((r) => r.json()).then(setTraza).catch(() => {}); }, []);

  // Cruce de cada foco con el registro provincial
  const cruce = useMemo(() => focos.map((f) => ({ f, c: clasificarFoco(f.lat, f.lon, sig.instalaciones, sig.venteos, sig.areas) })), [focos, sig.instalaciones, sig.venteos, sig.areas]);
  const conteo = useMemo(() => {
    const k: Record<Clase, number> = { autorizado: 0, vencido: 0, instalacion: 0, fuera: 0, sin_registro: 0 };
    cruce.forEach(({ c }) => k[c.clase]++);
    return k;
  }, [cruce]);
  const venteosEstado = useMemo(() => estadoVenteos(sig.venteos, focos), [sig.venteos, focos]);

  // Prioridad de revisión por área: suma ponderada de señales que una operadora tendría que poder explicar
  const PESOS = { fuera: 4, instalacion: 3, vencido: 2, sumRevisar: 2, sumDejo: 1 } as const;
  const prioridad = useMemo(() => {
    const por = new globalThis.Map<string, { nombre: string; operador: string; fuera: number; instalacion: number; vencido: number; autorizado: number; sumRevisar: number; sumDejo: number; puntos: number }>();
    const fila = (a: any) => {
      const k = a?.nombre; if (!k) return null;
      if (!por.has(k)) por.set(k, { nombre: k, operador: a.operador ?? "", fuera: 0, instalacion: 0, vencido: 0, autorizado: 0, sumRevisar: 0, sumDejo: 0, puntos: 0 });
      return por.get(k)!;
    };
    for (const { c } of cruce) {
      const r = c.area ? fila(c.area) : null; if (!r) continue;
      if (c.clase === "fuera" || c.clase === "instalacion" || c.clase === "vencido" || c.clase === "autorizado") r[c.clase]++;
    }
    if (iny && sig.areas) {
      const pozos = [...sig.sumideros.map((x) => ({ lat: x.lat, lon: x.lon, id: x.id_nacion })), ...((nacionRef.current?.features || []) as any[]).map((f) => ({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], id: f.properties.id_nacion }))];
      for (const p of pozos) {
        const d = p.id != null ? iny.pozos[String(p.id)] : undefined; if (!d) continue;
        const aviso = leerIny(d, iny).aviso;
        if (aviso !== "activo_sin" && aviso !== "dejo") continue;
        const r = fila(areaDe(p.lat, p.lon, sig.areas)); if (!r) continue;
        if (aviso === "activo_sin") r.sumRevisar++; else r.sumDejo++;
      }
    }
    const lista = [...por.values()].map((r) => ({ ...r, puntos: r.fuera * PESOS.fuera + r.instalacion * PESOS.instalacion + r.vencido * PESOS.vencido + r.sumRevisar * PESOS.sumRevisar + r.sumDejo * PESOS.sumDejo }))
      .filter((r) => r.puntos > 0).sort((a, b) => b.puntos - a.puntos);
    return lista;
  }, [cruce, iny, sig.areas, sig.sumideros, nacionListo]);
  const irArea = (nombre: string) => {
    const f = (sig.areas?.features || []).find((x: any) => x.properties?.nombre === nombre);
    const map = mapRef.current; if (!f || !map) return;
    let w = 180, s0 = 90, e = -180, n = -90;
    const rec = (c: any) => { if (typeof c[0] === "number") { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s0 = Math.min(s0, c[1]); n = Math.max(n, c[1]); } else c.forEach(rec); };
    rec(f.geometry.coordinates);
    map.fitBounds([[w, s0], [e, n]], { padding: 60, duration: 900 });
  };
  const operadoras = useMemo(() => [...new Set(sig.venteos.map((v) => v.empresa).filter(Boolean) as string[])].sort(), [sig.venteos]);
  const resumenVent = useMemo(() => ({
    vigentes: venteosEstado.filter((v) => v.vigente).length,
    detectados: venteosEstado.filter((v) => v.vigente && v.detecciones > 0).length,
    sin: venteosEstado.filter((v) => v.vigente && v.detecciones === 0).length,
    vencidos: venteosEstado.filter((v) => !v.vigente).length
  }), [venteosEstado]);

  const listaVent = venteosEstado
    .filter((v) => operador === "todas" || v.venteo.empresa === operador)
    .filter((v) => filtroVent === "todos" || (filtroVent === "vencido" ? !v.vigente : filtroVent === "detectado" ? v.vigente && v.detecciones > 0 : v.vigente && v.detecciones === 0))
    .sort((a, b) => b.detecciones - a.detecciones || (b.venteo.m3_dia_autorizado ?? 0) - (a.venteo.m3_dia_autorizado ?? 0));

  // Buscador por partes: plantas, áreas y los 19.657 pozos del padrón nacional
  const [buscadorUsado, setBuscadorUsado] = useState(false);
  const pozosIdx = usePozosNeuquen(buscadorUsado);
  type Resultado = { tipo: "planta" | "area" | "pozo"; titulo: string; detalle: string; lat: number; lon: number; abrir: () => void };
  const indice = useMemo(() => {
    const plantas = indexar(sig.instalaciones, (i: any) => ({ codigo: `${i.sigla ?? ""} ${i.nombre ?? ""}`, texto: `${i.nombre} ${i.sigla} ${i.area} ${i.operador} ${i.tipo}` }));
    const areas = indexar((sig.areas?.features || []) as any[], (f) => ({ codigo: `${f.properties?.sigla ?? ""} ${f.properties?.nombre ?? ""}`, texto: `${f.properties?.nombre} ${f.properties?.operador}` }));
    const pozos = indexar(pozosIdx?.pozos || [], (p: PozoIdx) => ({ codigo: p[0], texto: `${p[0]} ${p[2]} ${p[3]} ${pozosIdx!.tipos[p[4]] ?? ""}`, tipo: p[4], activo: !/abandon/i.test(p[5]) }));
    return { plantas, areas, pozos };
  }, [sig.instalaciones, sig.areas, pozosIdx]);
  const resultados = useMemo<Resultado[]>(() => {
    const q = busqueda.trim();
    if (q.length < 2) return [];
    const plantas = buscarPorPartes(indice.plantas, q, 5).map((i: any) => ({ tipo: "planta" as const, titulo: i.nombre ?? i.sigla ?? "Instalación", detalle: `${i.tipo ?? "Instalación"} · ${i.area ?? ""} · ${i.operador ?? ""}`, lat: i.lat, lon: i.lon,
      abrir: () => ir(i.lat, i.lon, { tipo: "Instalación declarada", titulo: i.nombre ?? "", lat: i.lat, lon: i.lon, datos: [["Tipo", i.tipo], ["Operadora", i.operador], ["Área", i.area], ["Estado", i.estado], ["Venteo declarado", i.venteo], ["Sistema de venteo", i.sistema_venteo]] }) }));
    const pozos = buscarPorPartes(indice.pozos, q, 10).map((p) => {
      const tipo = pozosIdx?.tipos[p[4]] ?? "Pozo";
      return { tipo: "pozo" as const, titulo: p[0], detalle: `${tipo} · ${p[5]} · ${p[2]} · ${p[3]}`, lat: p[6], lon: p[7],
        abrir: () => ir(p[6], p[7], { tipo: `Pozo (${tipo.toLowerCase()}), según el padrón nacional`, titulo: p[0], lat: p[6], lon: p[7], idNacion: String(p[1]),
          datos: [["Operadora", p[3]], ["Área", p[2]], ["Tipo (Nación)", tipo], ["Estado (Nación)", p[5]], ["Id. nacional", p[1]]] }) };
    });
    const areas = buscarPorPartes(indice.areas, q, 3).map((f: any) => {
      const n = f.properties?.nombre;
      return { tipo: "area" as const, titulo: n, detalle: `Área · ${f.properties?.operador ?? ""}`, lat: 0, lon: 0, abrir: () => irArea(n) };
    });
    return [...pozos, ...plantas, ...areas].slice(0, 14);
  }, [busqueda, indice]);

  // ---------------- Capas del mapa ----------------
  const alListo = (map: MLMap) => {
    mapRef.current = map;
    map.jumpTo({ center: [-68.85, -38.3], zoom: 8.2, pitch: 0 });
    for (const capa of ["Locaciones", "Pozos"]) {
      map.addSource(`wms-${capa}`, { type: "raster", tiles: [`/api/neuquen/wms?capa=${capa}&bbox={bbox-epsg-3857}`], tileSize: 256, minzoom: 11, attribution: "SIG Hidrocarburos Neuquén" });
      map.addLayer({ id: `x-wms-${capa}`, type: "raster", source: `wms-${capa}`, minzoom: 11, paint: { "raster-opacity": 0.85 } });
    }
    const vacio: any = { type: "FeatureCollection", features: [] };
    for (const id of ["areas", "ductos", "traza", "sumideros", "sumnac", "inst", "vent", "focosx"]) setGeo(map, id, vacio);
    fetch("/capas/sumideros-nacion.geojson").then((r) => r.json()).then((g) => { nacionRef.current = g; setNacionListo(true); }).catch(() => {});
    map.addLayer({ id: "x-areas-linea", type: "line", source: "areas", paint: { "line-color": "#8FE3F0", "line-opacity": 0.45, "line-width": 1 } });
    map.addLayer({ id: "x-areas-rotulo", type: "symbol", source: "areas", minzoom: 8.5, layout: { "text-field": ["get", "nombre"], "text-size": 10, "text-font": ["Open Sans Regular"] }, paint: { "text-color": "#8FE3F0", "text-halo-color": "#12100E", "text-halo-width": 1.2 } });
    map.addLayer({ id: "x-ductos", type: "line", source: "ductos", paint: { "line-color": ["case", ["==", ["get", "fluido"], "Gas"], "#C9A46A", "#EEE7DB"], "line-width": 1.6, "line-opacity": 0.8 } });
    map.addLayer({ id: "x-traza", type: "line", source: "traza", paint: { "line-color": "#FF4D6D", "line-width": 3, "line-dasharray": [2, 1] } });
    map.addLayer({ id: "x-sum", type: "circle", source: "sumideros", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.5, 12, 6], "circle-color": ["coalesce", ["get", "coh_color"], "#5AA9FF"], "circle-stroke-color": "#12100E", "circle-stroke-width": 1 } });
    map.addLayer({ id: "x-sumn", type: "circle", source: "sumnac", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3.5, 12, 8], "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": ["coalesce", ["get", "coh_color"], "#B9DCFF"], "circle-stroke-width": 1.8 } });
    map.addLayer({ id: "x-inst", type: "circle", source: "inst", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.5, 12, 7], "circle-color": ["get", "color"], "circle-opacity": 0.9, "circle-stroke-color": "#12100E", "circle-stroke-width": 1.2 } });
    map.addLayer({ id: "x-vent", type: "circle", source: "vent", paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 6, 12, 14], "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": ["case", ["get", "vig"], "#7BD88F", "#FFC857"], "circle-stroke-width": 2
    } });
    map.addLayer({ id: "x-focos-halo", type: "circle", source: "focosx", paint: { "circle-color": ["get", "color"], "circle-opacity": 0.3, "circle-blur": 0.8, "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 6, 12, ["+", 14, ["*", 2, ["get", "frp"]]]] } });
    map.addLayer({ id: "x-focos", type: "circle", source: "focosx", paint: { "circle-color": ["get", "color"], "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3, 12, 6], "circle-stroke-color": "#12100E", "circle-stroke-width": 1 } });
    const clic = (id: string, fn: (p: any, c: [number, number]) => Seleccion) => {
      map.on("click", id, (e: any) => {
        const ft = e.features?.[0];
        if (!ft) return;
        const c = ft.geometry.type === "Point" ? ft.geometry.coordinates : [e.lngLat.lng, e.lngLat.lat];
        setSel(fn(ft.properties, c));
      });
      map.on("mouseenter", id, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", id, () => { map.getCanvas().style.cursor = ""; });
    };
    clic("x-inst", (p, c) => ({ tipo: "Instalación declarada", titulo: p.nombre || p.sigla || "Instalación", lat: c[1], lon: c[0], datos: [
      ["Tipo", p.tipo], ["Operadora", p.operador], ["Área", p.area], ["Estado", p.estado], ["Venteo declarado", p.venteo], ["Sistema de venteo", p.sistema_venteo],
      ["Gas, capacidad de diseño", p.gas_diseno], ["Gas, caudal actual", p.gas_actual], ["Petróleo, diseño", p.petroleo_diseno], ["Acta de inspección", p.acta], ["Observaciones", p.observaciones]
    ] }));
    clic("x-vent", (p, c) => ({ tipo: "Venteo autorizado", titulo: p.instalacion || "Venteo", lat: c[1], lon: c[0], datos: [
      ["Empresa", p.empresa], ["Área", p.area], ["Motivo", p.motivo], ["Autorizado (m³/día)", p.m3_dia_autorizado], ["Disposición", p.disposicion],
      ["Expediente", p.expediente], ["Vigencia", `${p.inicio ?? "?"} al ${p.vencimiento ?? "?"}`], ["Detecciones en la ventana", p.detecciones]
    ] }));
    clic("x-sum", (p, c) => ({ tipo: "Pozo sumidero", titulo: p.nombre || "Sumidero", lat: c[1], lon: c[0], idNacion: p.id_nacion != null ? String(p.id_nacion) : null, datos: [
      ["Operadora", p.operador], ["Operadora original", p.operador_original !== p.operador ? p.operador_original : null], ["Área", p.area], ["Yacimiento", p.yacimiento],
      ["Estado", p.estado], ["Abandono", p.abandono], ["Formación", p.formacion], ["Profundidad medida (m)", p.profundidad_m],
      ["Perforación", p.inicio_perf ? `${p.inicio_perf}${p.fin_perf ? ` al ${p.fin_perf}` : ""}` : p.anio],
      ["Terminación (inicio de operación)", p.fin_term || p.inicio_term || "Sin fecha en el registro"],
      ["Legajo en la Provincia", p.legajo === "SI" ? "Sí" : p.legajo === "NO" ? "No" : p.legajo]
    ] }));
    clic("x-sumn", (p, c) => ({ tipo: "Sumidero en el registro nacional (no figura en la capa provincial)", titulo: p.nombre || "Sumidero", lat: c[1], lon: c[0], idNacion: p.id_nacion != null ? String(p.id_nacion) : null, datos: [
      ["Operadora", p.operador], ["Área", p.area], ["Yacimiento", p.yacimiento], ["Estado (Nación)", p.estado], ["Formación", p.formacion], ["Profundidad (m)", p.profundidad_m],
      ["Perforación", p.inicio_perf], ["Terminación (inicio de operación)", p.fin_term || "Sin fecha en el registro"]
    ] }));
    clic("x-ductos", (p, c) => ({ tipo: "Ducto troncal", titulo: p.nombre || "Ducto", lat: c[1], lon: c[0], datos: [
      ["Fluido", p.fluido], ["Operadora", p.operador], ["Desde", p.desde], ["Hasta", p.hasta], ["Diámetro (pulg)", p.diametro_pulg], ["Longitud (km)", p.longitud_km], ["Estado", p.estado]
    ] }));
    clic("x-focos", (p, c) => ({ tipo: "Foco térmico FIRMS", titulo: `${Number(p.frp).toFixed(1)} MW`, lat: c[1], lon: c[0], fecha: String(p.fecha || ""), datos: [
      ["Clasificación", CLASES[p.clase as Clase]?.nombre], ["Fecha", p.fecha], ["Sensor", p.sensor], ["Venteo autorizado más cercano", p.venteo], ["Instalación más cercana", p.inst], ["Área", p.area]
    ] }));
    setListo(true);
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    if (sig.areas) setGeo(map, "areas", sig.areas);
    if (sig.ductos) setGeo(map, "ductos", sig.ductos);
    if (traza) setGeo(map, "traza", traza);
    // Con permiso a los datos de Nación, cada sumidero toma el color de su inyección declarada
    const cohColor = (id: any) => {
      if (!iny || !capaOk("sumnac") || id == null) return undefined;
      const p = iny.pozos[String(id)];
      return p ? COHERENCIA[leerIny(p, iny).aviso].color : COHERENCIA.sin_nacion.color;
    };
    setGeo(map, "sumideros", { type: "FeatureCollection", features: sig.sumideros.map((s) => ({ type: "Feature", properties: { ...s, coh_color: cohColor(s.id_nacion) }, geometry: { type: "Point", coordinates: [s.lon, s.lat] } })) } as any);
    if (nacionRef.current) setGeo(map, "sumnac", { ...nacionRef.current, features: nacionRef.current.features.map((f: any) => ({ ...f, properties: { ...f.properties, coh_color: cohColor(f.properties.id_nacion) } })) });
    setGeo(map, "inst", { type: "FeatureCollection", features: sig.instalaciones.map((i) => ({ type: "Feature", properties: { ...i, color: colorTipo(i.tipo) }, geometry: { type: "Point", coordinates: [i.lon, i.lat] } })) } as any);
    const det = new globalThis.Map<any, (typeof venteosEstado)[number]>(venteosEstado.map((v) => [v.venteo, v]));
    setGeo(map, "vent", { type: "FeatureCollection", features: sig.venteos.map((v) => ({ type: "Feature", properties: { ...v, vig: det.get(v)?.vigente ?? true, detecciones: det.get(v)?.detecciones ?? 0 }, geometry: { type: "Point", coordinates: [v.lon, v.lat] } })) } as any);
    setGeo(map, "focosx", { type: "FeatureCollection", features: cruce.map(({ f, c }) => ({ type: "Feature", properties: {
      frp: f.frp, fecha: f.fecha, sensor: f.sensor, clase: c.clase, color: CLASES[c.clase].color,
      venteo: c.venteo ? `${c.venteo.item.instalacion} (${c.venteo.item.empresa}), a ${Math.round(c.venteo.distancia)} m` : "—",
      inst: c.instalacion ? `${c.instalacion.item.nombre} (${c.instalacion.item.tipo}), a ${Math.round(c.instalacion.distancia)} m` : "—",
      area: c.area ? `${c.area.nombre} (${c.area.operador})` : "Fuera de áreas de Neuquén"
    }, geometry: { type: "Point", coordinates: [f.lon, f.lat] } })) } as any);
    for (const [id, capas] of Object.entries(CAPAS_MAP)) for (const l of capas) if (map.getLayer(l)) map.setLayoutProperty(l, "visibility", vis[id as IdCapa] && capaOk(id) ? "visible" : "none");
  }, [listo, sig.areas, sig.ductos, sig.instalaciones, sig.venteos, sig.sumideros, traza, cruce, venteosEstado, vis, capasPermitidas, iny, nacionListo]);

  // Desde la tabla de sumideros: centrar y abrir la ficha del pozo elegido
  useEffect(() => {
    if (!listo) return;
    let d: any = null;
    try { d = JSON.parse(sessionStorage.getItem("ir-a-punto") || "null"); sessionStorage.removeItem("ir-a-punto"); } catch { /* */ }
    const s0 = d && sig.sumideros.find((x) => x.id_nacion != null && String(x.id_nacion) === d.idNacion);
    if (d) ir(d.lat, d.lon, { tipo: "Pozo sumidero", titulo: d.nombre, lat: d.lat, lon: d.lon, idNacion: d.idNacion,
      datos: s0 ? [["Operadora", s0.operador], ["Área", s0.area], ["Estado (Provincia)", s0.estado], ["Perforación", s0.inicio_perf ?? s0.anio]] : [] });
  }, [listo]);
  const ir = (lat: number, lon: number, s?: Seleccion) => {
    if (mapRef.current) enfocar(mapRef.current, [lon, lat], 13);
    if (s) setSel(s);
  };

  // ---------------- Exportación ----------------
  const fmtD = (c: Clasificacion) => c.venteo && c.venteo.distancia <= TOLERANCIA_M ? `${c.venteo.item.instalacion} (${Math.round(c.venteo.distancia)} m)` : c.instalacion && c.instalacion.distancia <= TOLERANCIA_M ? `${c.instalacion.item.nombre} (${Math.round(c.instalacion.distancia)} m)` : "—";
  const exportarInforme = async () => {
    let mapa: HTMLCanvasElement | undefined;
    try { if (mapRef.current) mapa = await capturarMapa(mapRef.current); } catch { /* */ }
    generarInformePDF({
      titulo: "Cruce de focos térmicos con instalaciones declaradas",
      subtitulo: `NASA FIRMS, últimos ${dias} días, contra el registro oficial de la Provincia del Neuquén. ${focos.length} focos, ${sig.instalaciones.length} instalaciones, ${sig.venteos.length} venteos autorizados.`,
      mapa, leyenda: LEYENDA,
      secciones: [
        { titulo: "Resumen", texto: [
          ...(Object.keys(CLASES) as Clase[]).map((k) => `${CLASES[k].nombre}: ${conteo[k]} focos.`),
          `Venteos autorizados vigentes: ${resumenVent.vigentes}. Con calor detectado en la ventana: ${resumenVent.detectados}. Sin detección: ${resumenVent.sin}. Permisos vencidos en el registro: ${resumenVent.vencidos}.`,
          "Sin detección no significa que no se haya venteado: el flare puede estar por debajo del umbral de FIRMS, cerrado, apagado, o la pasada pudo ser de día o con nubes."
        ] },
        { titulo: "Focos y su clasificación", tabla: { columnas: ["Fecha (UTC)", "Lat", "Lon", "FRP (MW)", "Clasificación", "Referencia a menos de 1 km", "Área"],
          filas: [...cruce].sort((a, b) => b.f.frp - a.f.frp).map(({ f, c }) => [f.fecha, f.lat.toFixed(4), f.lon.toFixed(4), f.frp.toFixed(2), CLASES[c.clase].nombre, fmtD(c), c.area?.nombre ?? "—"]) } },
        { titulo: "Venteos autorizados y detección", tabla: { columnas: ["Instalación", "Empresa", "Área", "m³/día autorizado", "Vence", "Detecciones", "FRP máx (MW)"],
          filas: [...venteosEstado].sort((a, b) => b.detecciones - a.detecciones).map((v) => [v.venteo.instalacion ?? "", v.venteo.empresa ?? "", v.venteo.area ?? "", v.venteo.m3_dia_autorizado ?? "", v.venteo.vencimiento ?? "", v.vigente ? v.detecciones : "vencido", v.frpMax ? v.frpMax.toFixed(1) : ""]) } }
      ],
      metodo: `Focos: NASA FIRMS VIIRS 375 m (NOAA-20, NOAA-21, Suomi NPP). Instalaciones, venteos autorizados, áreas, ductos y sumideros: ${FUENTE_NQN} (${URL_SIG_NQN}), consultado ${sig.consultado?.slice(0, 10) ?? ""}. Un foco se asocia a un venteo o instalación si está a menos de ${TOLERANCIA_M} m (pixel VIIRS 375 m más error de posición). La potencia radiativa (FRP) no equivale a caudal venteado.`,
      archivo: nombreArchivo("cruce-focos-instalaciones-neuquen", "pdf")
    });
  };
  const exportarCsv = () => {
    const filas = [["fecha_utc", "lat", "lon", "frp_mw", "sensor", "clasificacion", "venteo_cercano", "dist_venteo_m", "instalacion_cercana", "dist_instalacion_m", "area"]];
    for (const { f, c } of cruce) filas.push([f.fecha, String(f.lat), String(f.lon), String(f.frp), f.sensor, CLASES[c.clase].nombre, c.venteo?.item.instalacion ?? "", c.venteo ? String(Math.round(c.venteo.distancia)) : "", c.instalacion?.item.nombre ?? "", c.instalacion ? String(Math.round(c.instalacion.distancia)) : "", c.area?.nombre ?? ""]);
    descargarTexto(filas.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n"), nombreArchivo("cruce-focos-instalaciones", "csv"), "text/csv;charset=utf-8");
  };

  return (
    <div className="flex flex-col lg:flex-row lg:h-screen">
      <section className="tema-noche bg-noche relative h-[64vh] lg:h-auto lg:flex-1" aria-label="Mapa de instalaciones hidrocarburíferas de Neuquén">
        <Globo centro={[-68.85, -38.3]} zoom={8} onListo={alListo} posicionSelector="left-4 bottom-10"
          tituloExport="Instalaciones declaradas y focos térmicos" subtituloExport={`Registro provincial de Neuquén + NASA FIRMS (${dias} días)`} leyendaExport={LEYENDA} />
        <div className="absolute left-4 top-4 sm:left-6 sm:top-6 max-w-md pointer-events-none">
          <h1 className="titulo text-4xl sm:text-5xl font-semibold">Instalaciones</h1>
          <p className="text-tenue text-sm mt-1">Registro oficial de la Subsecretaría de Energía de Neuquén cruzado con los focos térmicos de NASA FIRMS.</p>
        </div>

        {/* Buscador */}
        <div className="absolute right-4 top-4 w-[320px] max-w-[calc(100%-2rem)] z-10">
          <label className="flex items-center gap-2 instrumento px-3 py-2">
            <Search className="w-4 h-4 text-tenue" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onFocus={() => setBuscadorUsado(true)} placeholder="Buscar pozo, planta, área u operadora" className="bg-transparent text-sm outline-none w-full placeholder:text-tenue" />
          </label>
          {busqueda.trim().length >= 2 && (
            <ul className="instrumento mt-1 divide-y divide-linea text-sm max-h-80 overflow-auto">
              {resultados.map((r, k) => (
                <li key={k}><button className="w-full text-left px-3 py-2 hover:bg-noche/50" onClick={() => { setBusqueda(""); r.abrir(); }}>
                  <span className="flex items-baseline gap-2"><span className="text-[10px] uppercase tracking-wide text-hielo shrink-0">{r.tipo === "pozo" ? "Pozo" : r.tipo === "planta" ? "Planta" : "Área"}</span><span className="truncate">{r.titulo}</span></span>
                  <span className="block text-xs text-tenue truncate">{r.detalle}</span>
                </button></li>
              ))}
              {resultados.length === 0 && <li className="px-3 py-2 text-xs text-tenue">{buscadorUsado && !pozosIdx ? "Cargando el padrón de pozos…" : "Sin coincidencias. Probá con una parte de la sigla (por ejemplo \"adv x1\") o el área."}</li>}
            </ul>
          )}
        </div>

        {/* Ficha */}
        <AnimatePresence>
          {sel && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="absolute right-4 bottom-10 w-[320px] max-w-[calc(100%-2rem)] max-h-[calc(100%-5rem)] overflow-y-auto instrumento p-4 z-10">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="titulo text-xl font-semibold leading-tight">{sel.titulo}</p>
                  <p className="text-[11px] text-tenue mt-0.5">{sel.tipo}</p>
                </div>
                <button onClick={() => setSel(null)} aria-label="Cerrar" className="text-tenue hover:text-texto"><X className="w-4 h-4" /></button>
              </div>
              <dl className="mt-3 space-y-1 text-xs">
                {sel.datos.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-tenue shrink-0">{k}</dt><dd className="text-right">{typeof v === "number" ? v.toLocaleString("es-AR") : v}</dd></div>
                ))}
              </dl>
              {sel.tipo === "Foco térmico FIRMS" && mapRef.current && <ConfirmarS2 {...{ key: `${sel.lat},${sel.lon}` }} lat={sel.lat} lon={sel.lon} fecha={sel.fecha} mapa={mapRef.current} instalaciones={sig.instalaciones} venteos={sig.venteos} areas={sig.areas} />}
              {sel.idNacion && iny && (puede("instalaciones.nacion") || puede("instalaciones.tabla")) && <FichaInyeccion p={iny.pozos[sel.idNacion]} datos={iny} />}
              <div className="mt-3 flex gap-2 text-xs">
                <button onClick={() => ir(sel.lat, sel.lon)} className="flex-1 px-2 py-1.5 border border-linea text-hielo hover:border-hielo">Acercar</button>
                <a className="flex-1 text-center px-2 py-1.5 border border-linea text-hielo hover:border-hielo" target="_blank" rel="noopener" href={`https://earth.google.com/web/@${sel.lat},${sel.lon},0a,1200d,35y,0h,45t,0r`}>Google Earth ↗</a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <aside className="lg:w-[400px] lg:overflow-y-auto border-l border-linea bg-panel/60">
        <div className="p-5 border-b border-linea">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-tenue">Ventana de focos FIRMS</p>
            <div className="flex text-xs border border-linea">
              {[2, 7, 10].map((d) => (
                <button key={d} onClick={() => setDias(d)} aria-pressed={dias === d} className={`px-2.5 py-1 ${dias === d ? "bg-hielo text-noche" : "text-hielo"}`}>{d} días</button>
              ))}
            </div>
          </div>
          <p className="num text-4xl text-llama mt-3 leading-none">{estadoFirms === "cargando" ? "…" : focos.length}</p>
          <p className="text-xs text-tenue">focos térmicos, clasificados contra el registro provincial</p>
          <ul className="mt-4 space-y-2">
            {(Object.keys(CLASES) as Clase[]).map((k) => (
              <li key={k} title={CLASES[k].detalle}>
                <div className="flex items-center justify-between text-sm gap-2">
                  <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CLASES[k].color }} />{CLASES[k].nombre}</span>
                  <span className="num">{conteo[k]}</span>
                </div>
                <div className="h-1 bg-noche mt-1"><div className="h-1" style={{ width: `${focos.length ? (conteo[k] / focos.length) * 100 : 0}%`, background: CLASES[k].color }} /></div>
              </li>
            ))}
          </ul>
          {sig.error && <p className="text-llama text-xs mt-3">Registro provincial: {sig.error}</p>}
          {estadoFirms === "error" && <p className="text-llama text-xs mt-3">No se pudo consultar NASA FIRMS.</p>}
          {puede("instalaciones.exportar") && <div className="mt-4 flex gap-2 text-xs">
            <button onClick={exportarInforme} disabled={!focos.length} className="flex items-center gap-1.5 px-2.5 py-1.5 border border-linea text-hielo hover:border-hielo disabled:opacity-50"><FileDown className="w-3.5 h-3.5" /> Informe PDF</button>
            <button onClick={exportarCsv} disabled={!focos.length} className="px-2.5 py-1.5 border border-linea text-hielo hover:border-hielo disabled:opacity-50">CSV del cruce</button>
          </div>}
        </div>

        <div className="p-5 border-b border-linea">
          <p className="text-xs text-tenue mb-2">Capas</p>
          <div className="flex flex-wrap gap-1.5">
            {CAPAS.filter((c) => capaOk(c.id)).map((c) => (
              <button key={c.id} onClick={() => setVis((v) => ({ ...v, [c.id]: !v[c.id] }))} aria-pressed={vis[c.id]}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs border ${vis[c.id] ? "border-hielo text-texto" : "border-linea text-tenue"}`}>
                <span className="w-2 h-2 rounded-full ring-1 ring-linea-fuerte" style={{ background: c.color, opacity: vis[c.id] ? 1 : 0.35 }} />{c.nombre}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-tenue mt-3">
            {sig.cargando ? "Cargando registro provincial…" : `${sig.instalaciones.length} instalaciones, ${sig.venteos.length} venteos autorizados, ${sig.sumideros.length} sumideros, ${sig.areas?.features?.length ?? 0} áreas.`}
            {" "}Instalaciones por color: celeste gas, ocre crudo, blanco baterías y USP, azul agua e inyección, violeta otras.
          </p>
          {capaOk("sumnac") && iny && (
            <div className="mt-3">
              <p className="text-[11px] text-tenue mb-1.5">Sumideros por inyección declarada a Nación:</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {(["activo_sin", "dejo", "inyecta", "inactivo", "sin_nacion"] as const).map((k) => (
                  <span key={k} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: COHERENCIA[k].color }} />{COHERENCIA[k].nombre}</span>
                ))}
              </div>
            </div>
          )}
          {puede("instalaciones.tabla") && <a href="#/sumideros" className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-linea text-hielo hover:border-hielo">Tabla de sumideros con inyección declarada →</a>}
        </div>

        {puede("instalaciones.prioridad") && <div className="p-5 border-b border-linea">
          <h2 className="titulo text-2xl font-semibold">Prioridad de revisión por área</h2>
          <p className="text-xs text-tenue mt-1">Suma de señales del período elegido que una operadora tendría que poder explicar: focos lejos de instalaciones ({PESOS.fuera} puntos), en instalaciones sin permiso ({PESOS.instalacion}), con permiso vencido ({PESOS.vencido}), sumideros activos sin inyección declarada ({PESOS.sumRevisar}) o que dejaron de declarar ({PESOS.sumDejo}). Es una guía para ordenar el trabajo, no una infracción.</p>
          {prioridad.length === 0 ? <p className="text-sm text-tenue mt-3">Sin señales en el período.</p> : (
            <ol className="mt-3 space-y-2">
              {prioridad.slice(0, 10).map((r, i) => (
                <li key={r.nombre}>
                  <button onClick={() => irArea(r.nombre)} className="w-full text-left group">
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate"><span className="num text-tenue mr-1.5">{i + 1}</span>{r.nombre}<span className="text-tenue text-xs"> · {r.operador}</span></span>
                      <span className="num text-hielo">{r.puntos}</span>
                    </span>
                    <span className="mt-1 block h-1.5 bg-linea"><span className="block h-full bg-llama" style={{ width: `${(r.puntos / prioridad[0].puntos) * 100}%` }} /></span>
                    <span className="mt-1 flex flex-wrap gap-x-2.5 text-[11px] text-tenue">
                      {r.fuera > 0 && <span>{r.fuera} lejos de instalaciones</span>}
                      {r.instalacion > 0 && <span>{r.instalacion} sin permiso</span>}
                      {r.vencido > 0 && <span>{r.vencido} permiso vencido</span>}
                      {r.sumRevisar > 0 && <span>{r.sumRevisar} sumidero sin inyección</span>}
                      {r.sumDejo > 0 && <span>{r.sumDejo} dejó de declarar</span>}
                      {r.autorizado > 0 && <span className="text-ok">{r.autorizado} con permiso</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>}
        {puede("instalaciones.venteos") && <div className="p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="titulo text-2xl font-semibold">Venteos autorizados</h2>
            <span className="num text-xs text-tenue">{resumenVent.detectados}/{resumenVent.vigentes} vigentes con calor</span>
          </div>
          <p className="text-[11px] text-tenue mt-1">Sin detección no prueba que no se haya venteado: puede estar bajo el umbral de FIRMS, ser un quemador cerrado o haberse quemado de día o con nubes.</p>
          <div className="mt-3 flex gap-2">
            <select value={operador} onChange={(e) => setOperador(e.target.value)} className="flex-1 bg-noche border border-linea text-xs px-2 py-1.5">
              <option value="todas">Todas las operadoras</option>
              {operadoras.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={filtroVent} onChange={(e) => setFiltroVent(e.target.value as any)} className="bg-noche border border-linea text-xs px-2 py-1.5">
              <option value="todos">Todos</option>
              <option value="detectado">Con calor</option>
              <option value="sin">Sin detección</option>
              <option value="vencido">Vencidos</option>
            </select>
          </div>
          <ul className="mt-3 divide-y divide-linea">
            {listaVent.slice(0, 80).map((v, k) => (
              <li key={k}>
                <button className="w-full text-left py-2.5 flex gap-3 items-start hover:bg-noche/40" onClick={() => ir(v.venteo.lat, v.venteo.lon, {
                  tipo: "Venteo autorizado", titulo: v.venteo.instalacion ?? "Venteo", lat: v.venteo.lat, lon: v.venteo.lon, datos: [
                    ["Empresa", v.venteo.empresa], ["Área", v.venteo.area], ["Motivo", v.venteo.motivo], ["Autorizado (m³/día)", v.venteo.m3_dia_autorizado],
                    ["Disposición", v.venteo.disposicion], ["Vigencia", `${v.venteo.inicio ?? "?"} al ${v.venteo.vencimiento ?? "?"}`],
                    ["Detecciones (ventana)", v.detecciones], ["FRP máximo (MW)", v.frpMax ? v.frpMax.toFixed(1) : null], ["Última detección", v.ultima]
                  ] })}>
                  <span className="mt-1 w-2.5 h-2.5 rounded-full border-2 shrink-0" style={{ borderColor: !v.vigente ? "var(--color-aviso)" : v.detecciones ? "var(--color-ok)" : "var(--color-tenue)", background: v.detecciones ? "var(--color-ok)" : "transparent" }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm truncate">{v.venteo.instalacion}</span>
                    <span className="block text-[11px] text-tenue truncate">{v.venteo.empresa} · {v.venteo.area} · {v.venteo.m3_dia_autorizado?.toLocaleString("es-AR") ?? "?"} m³/d</span>
                  </span>
                  <span className="num text-xs text-right shrink-0">{!v.vigente ? <span className="text-aviso">vencido</span> : v.detecciones ? <span className="text-ok">{v.detecciones} det.</span> : <span className="text-tenue">sin det.</span>}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-tenue mt-4">Fuente: <a className="text-hielo hover:underline" href={URL_SIG_NQN} target="_blank" rel="noopener">{FUENTE_NQN}</a>. Tolerancia de asociación {TOLERANCIA_M} m.</p>
        </div>}
      </aside>
    </div>
  );
}

/** Inyección declarada a Nación: barras por mes y lectura de coherencia */
function FichaInyeccion({ p, datos }: { p?: InyPozo; datos: InyDatos }) {
  if (!p) return <p className="mt-3 text-[11px] text-tenue">Sin declaraciones de inyección en {datos.desde.slice(0, 4)} en el registro nacional.</p>;
  const l = leerIny(p, datos);
  const max = Math.max(1, ...p.m3.map((v) => v ?? 0));
  const color = l.aviso === "activo_sin" || l.aviso === "dejo" ? "text-aviso" : "text-tenue";
  return (
    <div className="mt-3 border-t border-linea pt-3">
      <p className="text-xs font-medium">Inyección declarada a Nación</p>
      <div className="mt-2 flex items-end gap-[3px] h-10" aria-label="Metros cúbicos inyectados por mes">
        {p.m3.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${l.nombreMes(i)}: ${v === null ? "sin declaración" : `${v.toLocaleString("es-AR")} m³`}`}>
            <div className="w-full bg-agua/70" style={{ height: `${Math.max(v ? 2 : 0, ((v ?? 0) / max) * 32)}px` }} />
            <span className="text-[9px] text-tenue leading-none">{l.nombreMes(i)[0]}</span>
          </div>
        ))}
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-3"><dt className="text-tenue">Último mes con inyección</dt><dd>{l.ultimoMes ?? "Ninguno en el año"}</dd></div>
        {l.ultimoMes && <div className="flex justify-between gap-3"><dt className="text-tenue">Ese mes, por día</dt><dd className="num">{l.ultimoDia.toLocaleString("es-AR")} m³/d</dd></div>}
        <div className="flex justify-between gap-3"><dt className="text-tenue">Total {datos.desde.slice(0, 4)}</dt><dd className="num">{l.total.toLocaleString("es-AR")} m³</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-tenue">Estado declarado</dt><dd className="text-right">{p.estado}</dd></div>
        {p.fin_term && <div className="flex justify-between gap-3"><dt className="text-tenue">Terminación según Nación</dt><dd>{p.fin_term}</dd></div>}
        {p.abandono && <div className="flex justify-between gap-3"><dt className="text-tenue">Abandono según Nación</dt><dd>{p.abandono}</dd></div>}
      </dl>
      <p className={`mt-2 text-[11px] leading-snug ${color}`}>{l.texto}</p>
      <p className="mt-1 text-[10px] text-tenue">Capítulo IV, Secretaría de Energía. Datos hasta {l.nombreMes(p.m3.length - 1)}.</p>
    </div>
  );
}

/** Confirmación del foco con Sentinel-2: ubica la llama a 20 m y la asocia por distancia (150 m / 1 km) */
function ConfirmarS2({ lat, lon, fecha, mapa, instalaciones, venteos, areas }: { key?: string; lat: number; lon: number; fecha?: string; mapa: MLMap; instalaciones: any[]; venteos: any[]; areas: any }) {
  const [estado, setEstado] = useState<"inicio" | "cargando" | "listo" | "error">("inicio");
  const pozos = usePozosNeuquen(estado !== "inicio");
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => () => { if (mapa.getLayer("s2conf")) mapa.removeLayer("s2conf"); if (mapa.getSource("s2conf")) mapa.removeSource("s2conf"); }, [mapa]);
  const correr = async () => {
    setEstado("cargando");
    try {
      const resp = await fetch(`/api/confirmar-foco?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}${fecha ? `&fecha=${fecha.slice(0, 10)}` : ""}`);
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error);
      setR(d); setEstado("listo");
      const p = d.pasadas.find((x: any) => x.calientes.length) ?? d.pasadas[0];
      if (p) {
        const [w, s, e, n] = d.bbox;
        const coords: [[number, number], [number, number], [number, number], [number, number]] = [[w, n], [e, n], [e, s], [w, s]];
        const src = mapa.getSource("s2conf") as maplibregl.ImageSource | undefined;
        if (src) src.updateImage({ url: p.imagen, coordinates: coords });
        else { mapa.addSource("s2conf", { type: "image", url: p.imagen, coordinates: coords }); mapa.addLayer({ id: "s2conf", type: "raster", source: "s2conf", paint: { "raster-opacity": 0.9, "raster-resampling": "nearest" } }); }
        mapa.flyTo({ center: [lon, lat], zoom: 14, duration: 900 });
      }
    } catch (e: any) { setErr(e.message); setEstado("error"); }
  };
  // Distancia de la llama más brillante a la instalación o venteo más cercano
  const asociar = () => {
    const c = r?.pasadas?.find((x: any) => x.calientes.length)?.calientes?.[0];
    if (!c) return null;
    let mejor: { nombre: string; d: number } | null = null;
    for (const i of [...instalaciones.map((x) => ({ nombre: x.nombre ?? x.sigla, lat: x.lat, lon: x.lon })), ...venteos.map((v) => ({ nombre: `${v.instalacion} (venteo autorizado)`, lat: v.lat, lon: v.lon }))]) {
      const d = distM(c.lat, c.lon, i.lat, i.lon);
      if (!mejor || d < mejor.d) mejor = { nombre: i.nombre, d };
    }
    if (!mejor) return null;
    return mejor.d <= 150 ? { color: "text-ok", t: `En la instalación: ${mejor.nombre} (${Math.round(mejor.d)} m).` }
      : mejor.d <= 1000 ? { color: "text-aviso", t: `En el entorno de ${mejor.nombre} (${Math.round(mejor.d)} m): servidumbre, ducto o equipo auxiliar.` }
      : { color: "text-llama", t: `Sin infraestructura conocida a menos de 1 km (la más cercana: ${mejor.nombre}, a ${(mejor.d / 1000).toFixed(1)} km).` };
  };
  const a = estado === "listo" ? asociar() : null;
  // Dónde cae la llama: área, operadora y pozo más cercano (padrón nacional)
  const ubicar = () => {
    const c = r?.pasadas?.find((x: any) => x.calientes.length)?.calientes?.[0] ?? (r ? { lat, lon } : null);
    if (!c) return null;
    const area = areaDe(c.lat, c.lon, areas);
    let pozo: { p: PozoIdx; d: number } | null = null;
    for (const p of pozos?.pozos || []) {
      if (Math.abs(p[6] - c.lat) > 0.03 || Math.abs(p[7] - c.lon) > 0.04) continue;
      const d = distM(c.lat, c.lon, p[6], p[7]);
      if (!pozo || d < pozo.d) pozo = { p, d };
    }
    return { area, pozo };
  };
  const u = estado === "listo" ? ubicar() : null;
  return (
    <div className="mt-3 border-t border-linea pt-3">
      {estado === "inicio" && <button onClick={correr} className="w-full px-3 py-2 text-xs border border-hielo text-hielo hover:bg-hielo hover:text-noche">Confirmar con Sentinel-2 (20 m)</button>}
      {estado === "cargando" && <p className="text-xs text-tenue">Buscando pasadas de Sentinel-2 cerca de la fecha del foco…</p>}
      {estado === "error" && <p className="text-xs text-llama">{err}</p>}
      {estado === "listo" && r && (
        <div className="space-y-2 text-xs">
          <p className={r.resultado === "confirmado" ? "text-ok font-medium" : "text-tenue"}>{r.resultado === "confirmado" ? "Llama confirmada" : r.resultado === "no_visible" ? "No se ve llama en la pasada" : "Sin pasadas útiles"}</p>
          <p className="leading-snug">{r.lectura}</p>
          {a && <p className={`leading-snug ${a.color}`}>{a.t}</p>}
          {u && (
            <dl className="space-y-1">
              <div className="flex justify-between gap-3"><dt className="text-tenue">Área</dt><dd className="text-right">{u.area?.nombre ?? "Fuera de las áreas de Neuquén"}</dd></div>
              {u.area?.operador && <div className="flex justify-between gap-3"><dt className="text-tenue">Operadora del área</dt><dd className="text-right">{u.area.operador}</dd></div>}
              {u.pozo && <div className="flex justify-between gap-3"><dt className="text-tenue">Pozo más cercano</dt><dd className="text-right">{u.pozo.p[0]}, a {Math.round(u.pozo.d)} m<span className="block text-[10px] text-tenue">{pozos?.tipos[u.pozo.p[4]]} · {u.pozo.p[5]} · {u.pozo.p[3]}</span></dd></div>}
              {!u.pozo && pozos && <div className="text-tenue">Sin pozos registrados a menos de 3 km.</div>}
            </dl>
          )}
          {r.pasadas.length > 0 && <p className="text-[10px] text-tenue">Pasadas revisadas: {r.pasadas.map((p: any) => `${p.fecha.slice(0, 10)} (${p.calientes.length} calientes)`).join(", ")}. En el mapa: color falso infrarrojo, la llama en rojo.</p>}
        </div>
      )}
    </div>
  );
}
