import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import Globo, { setGeo } from "../components/Globo";
import { circuloKm } from "../lib/orbits";
import { Loader2, Crosshair, ListChecks } from "lucide-react";

type Nivel = "normal" | "observar" | "alerta" | "sin_datos";

interface Indicador {
  id: string;
  nombre: string;
  base: number | null;
  reciente: number | null;
  delta: number | null;
  unidad?: string;
  nivel: Nivel;
  lectura: string;
}

interface Resultado {
  punto: { lat: number; lon: number };
  radio_m: number;
  periodos: { reciente: { desde: string; hasta: string; escenas_validas: number }; base: { desde: string; hasta: string; escenas_validas: number } };
  indicadores: Indicador[];
  nivel_general: Nivel;
  series: { reciente: any[]; base: any[] };
  metodo: string;
}

interface Instalacion {
  codigo_sig: string;
  nombre_oficial: string;
  latitud_oficial: number;
  longitud_oficial: number;
}

interface ResultadoDerrame {
  tipo: "suelo" | "agua";
  nivel: Nivel;
  lectura: string;
  area_candidata_m2: number;
  area_analizada_m2: number;
  periodo: { desde: string; hasta: string; corte: string | null };
  metodo: string;
}

const COLOR_NIVEL: Record<Nivel, string> = { alerta: "#FF5A3D", observar: "#F2C14E", normal: "#7FD6A0", sin_datos: "#8BA0B6" };
const TEXTO_NIVEL: Record<Nivel, string> = { alerta: "Alerta", observar: "Observar", normal: "Sin cambios", sin_datos: "Sin datos" };

const SERIES = [
  { k: "ndwi", nombre: "Agua (NDWI)" },
  { k: "ndmi", nombre: "Humedad (NDMI)" },
  { k: "ndvi", nombre: "Vegetación (NDVI)" },
  { k: "bsi", nombre: "Suelo desnudo (BSI)" }
];

export default function SueloAgua() {
  const mapRef = useRef<MLMap | null>(null);
  const [listo, setListo] = useState(false);
  const [punto, setPunto] = useState<{ lat: number; lon: number; nombre?: string } | null>(null);
  const [radio, setRadio] = useState(500);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [serie, setSerie] = useState("ndwi");
  const [catastro, setCatastro] = useState<Instalacion[]>([]);
  const [lote, setLote] = useState<{ inst: Instalacion; nivel: Nivel | "error"; detalle?: string }[]>([]);
  const [loteCorriendo, setLoteCorriendo] = useState(false);
  const [modo, setModo] = useState<"cambios" | "derrames">("cambios");
  const [tipoDerrame, setTipoDerrame] = useState<"suelo" | "agua">("suelo");
  const [resDerrame, setResDerrame] = useState<ResultadoDerrame | null>(null);

  const analizarDerrame = async () => {
    if (!punto) return;
    const map = mapRef.current;
    if (map && map.getZoom() < 12.5) map.flyTo({ center: [punto.lon, punto.lat], zoom: 13.5, duration: 1200 });
    setCargando(true);
    setError(null);
    setResDerrame(null);
    try {
      const r = await fetch(`/api/derrames?tipo=${tipoDerrame}&lat=${punto.lat.toFixed(5)}&lon=${punto.lon.toFixed(5)}&radio=${radio}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setResDerrame(d);
      // Capa con los píxeles candidatos
      const img = await fetch(d.imagen.url);
      if (img.ok && map) {
        const url = URL.createObjectURL(await img.blob());
        const [w, so, e, n] = d.imagen.bbox;
        const coords: [[number, number], [number, number], [number, number], [number, number]] = [[w, n], [e, n], [e, so], [w, so]];
        const src = map.getSource("derrame-img") as maplibregl.ImageSource | undefined;
        if (src) src.updateImage({ url, coordinates: coords });
        else {
          map.addSource("derrame-img", { type: "image", url, coordinates: coords });
          map.addLayer({ id: "derrame-img", type: "raster", source: "derrame-img", paint: { "raster-opacity": 1, "raster-resampling": "nearest" } });
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    fetch("/api/geoportal/instalaciones").then((r) => r.json()).then((d) => setCatastro(d.instalaciones || [])).catch(() => {});
  }, []);

  // Click en el mapa para elegir punto
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    const h = (e: maplibregl.MapMouseEvent) => setPunto({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    map.on("click", h);
    map.getCanvas().style.cursor = "crosshair";
    return () => { map.off("click", h); };
  }, [listo]);

  // Dibujar área de análisis
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    const color = res ? COLOR_NIVEL[res.nivel_general] : "#8FE3F0";
    setGeo(map, "area-analisis", {
      type: "FeatureCollection",
      features: punto ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circuloKm(punto.lat, punto.lon, radio / 1000)] } }] : []
    });
    if (!map.getLayer("area-analisis")) {
      map.addLayer({ id: "area-analisis", type: "fill", source: "area-analisis", paint: { "fill-color": color, "fill-opacity": 0.15 } });
      map.addLayer({ id: "area-analisis-borde", type: "line", source: "area-analisis", paint: { "line-color": color, "line-width": 2 } });
    } else {
      map.setPaintProperty("area-analisis", "fill-color", color);
      map.setPaintProperty("area-analisis-borde", "line-color", color);
    }
    // Instalaciones del catastro
    setGeo(map, "catastro-sa", {
      type: "FeatureCollection",
      features: catastro.map((c) => {
        const r = lote.find((l) => l.inst.codigo_sig === c.codigo_sig);
        return { type: "Feature", properties: { color: r && r.nivel !== "error" ? COLOR_NIVEL[r.nivel] : "#C9A46A" }, geometry: { type: "Point", coordinates: [c.longitud_oficial, c.latitud_oficial] } };
      })
    });
    if (!map.getLayer("catastro-sa")) {
      map.addLayer({ id: "catastro-sa", type: "circle", source: "catastro-sa", paint: { "circle-radius": 5, "circle-color": ["get", "color"], "circle-stroke-color": "#0A1628", "circle-stroke-width": 1.5 } });
    }
  }, [punto, radio, res, listo, catastro, lote]);

  const analizar = async (p = punto, r = radio) => {
    if (!p) return;
    const map = mapRef.current;
    if (map && map.getZoom() < 12.5) map.flyTo({ center: [p.lon, p.lat], zoom: 13.5, duration: 1200 });
    setCargando(true);
    setError(null);
    setRes(null);
    try {
      const resp = await fetch(`/api/analisis/suelo-agua?lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}&radio=${r}`);
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `Error ${resp.status}`);
      setRes(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const elegirInstalacion = (i: Instalacion) => {
    const p = { lat: i.latitud_oficial, lon: i.longitud_oficial, nombre: i.nombre_oficial };
    setPunto(p);
    mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: 13, duration: 1200 });
    analizar(p);
  };

  const analizarCatastro = async () => {
    setLoteCorriendo(true);
    const lista = catastro.slice(0, 20);
    setLote([]);
    for (const inst of lista) {
      try {
        const r = await fetch(`/api/analisis/suelo-agua?lat=${inst.latitud_oficial}&lon=${inst.longitud_oficial}&radio=${radio}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        const peor = (d.indicadores as Indicador[]).filter((x) => x.nivel === d.nivel_general).map((x) => x.nombre).join(", ");
        setLote((prev) => [...prev, { inst, nivel: d.nivel_general, detalle: d.nivel_general === "normal" ? undefined : peor }]);
      } catch (e: any) {
        setLote((prev) => [...prev, { inst, nivel: "error", detalle: e.message }]);
      }
    }
    setLoteCorriendo(false);
  };

  return (
    <div className="flex flex-col lg:flex-row lg:min-h-screen">
      <section className="relative h-[55vh] lg:h-screen lg:flex-1 lg:sticky lg:top-0" aria-label="Mapa para elegir el área de análisis">
        <Globo centro={[-68.95, -38.3]} zoom={8} onListo={(m) => { mapRef.current = m; setListo(true); }} />
        <div className="absolute left-4 top-4 right-4 sm:right-auto instrumento px-4 py-3 max-w-sm pointer-events-none">
          <p className="flex items-center gap-2 text-sm"><Crosshair className="w-4 h-4 text-hielo" /> Tocá el mapa para elegir el punto a analizar</p>
          {punto && <p className="num text-xs text-tenue mt-1">{punto.nombre ? `${punto.nombre}, ` : ""}{punto.lat.toFixed(4)}°, {punto.lon.toFixed(4)}°</p>}
        </div>
      </section>

      <aside className="lg:w-[460px] border-l border-linea bg-panel/60">
        <div className="p-5 border-b border-linea">
          <h1 className="titulo text-4xl font-semibold">Suelo y agua</h1>
          <p className="text-sm text-tenue mt-1">
            Compara las imágenes Sentinel-2 de los últimos 60 días con el mismo período del año pasado y marca cambios de agua superficial, humedad del suelo, suelo descubierto y vegetación.
          </p>
        </div>

        <div className="px-5 pt-4 flex gap-1" role="tablist" aria-label="Tipo de análisis">
          {([["cambios", "Cambios de suelo y agua"], ["derrames", "Derrames de hidrocarburo"]] as const).map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={modo === id} onClick={() => { setModo(id); setError(null); }}
              className={`flex-1 px-3 py-2 text-sm border-b-2 ${modo === id ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>{txt}</button>
          ))}
        </div>

        {modo === "derrames" && (
          <div className="px-5 pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {([["suelo", "En suelo", "Sentinel-2, 20 m"], ["agua", "En agua", "Radar Sentinel-1, 10 m"]] as const).map(([id, t, sub]) => (
                <button key={id} onClick={() => setTipoDerrame(id)} aria-pressed={tipoDerrame === id}
                  className={`text-left px-3 py-2 border ${tipoDerrame === id ? "border-llama" : "border-linea"}`}>
                  <span className={`block font-medium ${tipoDerrame === id ? "text-llama" : ""}`}>{t}</span>
                  <span className="block text-xs text-tenue">{sub}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-tenue leading-relaxed">
              {tipoDerrame === "suelo"
                ? "Busca píxeles que se oscurecieron bruscamente en los últimos 20 días y quedaron oscuros, como el suelo empapado de crudo. Detecta manchas desde unos 800 m²."
                : "Elegí un punto sobre el río, embalse o una pileta. Busca zonas del agua que en la última pasada de radar aparecen mucho más lisas (oscuras) que lo habitual, como ocurre con una película de hidrocarburo."}
            </p>
          </div>
        )}

        <div className="p-5 border-b border-linea space-y-4">
          <div>
            <p className="text-xs text-tenue mb-1.5">Radio del área</p>
            <div className="flex gap-1.5 flex-wrap">
              {[250, 500, 1000, 2000].map((r) => (
                <button key={r} onClick={() => setRadio(r)} aria-pressed={radio === r}
                  className={`px-2.5 py-1 num text-xs border ${radio === r ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</button>
              ))}
            </div>
          </div>
          <button onClick={() => (modo === "cambios" ? analizar() : analizarDerrame())} disabled={!punto || cargando}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 font-semibold disabled:opacity-50 text-noche ${modo === "cambios" ? "bg-hielo" : "bg-llama"}`}>
            {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
            {cargando ? "Analizando imágenes…" : !punto ? "Elegí un punto en el mapa" : modo === "cambios" ? "Analizar este punto" : `Buscar derrame ${tipoDerrame === "suelo" ? "en suelo" : "en agua"}`}
          </button>
          {error && <p className="text-xs text-llama">{error}</p>}
        </div>

        {modo === "cambios" && res && <Informe res={res} serie={serie} setSerie={setSerie} />}
        {modo === "derrames" && resDerrame && <InformeDerrame r={resDerrame} />}

        <div className="p-5 border-t border-linea">
          <h2 className="titulo text-2xl font-semibold flex items-center gap-2"><ListChecks className="w-5 h-5 text-lutita" /> Instalaciones del catastro</h2>
          {catastro.length === 0 ? (
            <p className="text-sm text-tenue mt-2">Todavía no cargaste instalaciones. Subí tu KML en la pantalla Focos para analizarlas todas de una vez.</p>
          ) : (
            <>
              <button onClick={analizarCatastro} disabled={loteCorriendo}
                className="mt-3 flex items-center gap-2 px-3 py-2 text-sm border border-lutita text-lutita disabled:opacity-60">
                {loteCorriendo && <Loader2 className="w-4 h-4 animate-spin" />}
                {loteCorriendo ? `Analizando ${lote.length + 1} de ${Math.min(20, catastro.length)}…` : `Analizar ${Math.min(20, catastro.length)} instalaciones (radio ${radio} m)`}
              </button>
              <ul className="mt-3 divide-y divide-linea">
                {catastro.slice(0, 50).map((c) => {
                  const r = lote.find((l) => l.inst.codigo_sig === c.codigo_sig);
                  return (
                    <li key={c.codigo_sig}>
                      <button onClick={() => elegirInstalacion(c)} className="w-full text-left py-2.5 flex items-start gap-3 hover:bg-noche/40 px-1">
                        <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r && r.nivel !== "error" ? COLOR_NIVEL[r.nivel] : "#22405E" }} />
                        <span className="flex-1">
                          <span className="block text-sm">{c.nombre_oficial}</span>
                          {r && <span className="block text-xs text-tenue">{r.nivel === "error" ? `Error: ${r.detalle}` : TEXTO_NIVEL[r.nivel]}{r.detalle && r.nivel !== "error" ? `: ${r.detalle}` : ""}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Informe({ res, serie, setSerie }: { res: Resultado; serie: string; setSerie: (s: string) => void }) {
  const fmt = (v: number | null, unidad?: string) => (v === null ? "N/D" : unidad ? `${v.toFixed(1)}` : v.toFixed(3));
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="titulo text-2xl font-semibold">Resultado</h2>
        <span className="px-2.5 py-1 text-sm font-semibold" style={{ background: COLOR_NIVEL[res.nivel_general], color: "#0A1628" }}>{TEXTO_NIVEL[res.nivel_general]}</span>
      </div>
      <p className="num text-[11px] text-tenue">
        Reciente {res.periodos.reciente.desde} a {res.periodos.reciente.hasta} ({res.periodos.reciente.escenas_validas} compuestos sin nubes). Base {res.periodos.base.desde} a {res.periodos.base.hasta} ({res.periodos.base.escenas_validas}).
      </p>

      <div className="space-y-2.5">
        {res.indicadores.map((i) => (
          <div key={i.id} className="instrumento p-3.5" style={{ borderLeft: `3px solid ${COLOR_NIVEL[i.nivel]}` }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{i.nombre}</span>
              <span className="text-xs" style={{ color: COLOR_NIVEL[i.nivel] }}>{TEXTO_NIVEL[i.nivel]}</span>
            </div>
            <p className="num text-xs text-tenue mt-1">
              año anterior {fmt(i.base, i.unidad)} → ahora {fmt(i.reciente, i.unidad)}{i.unidad ? ` ${i.unidad}` : ""}
            </p>
            <p className="text-sm mt-1.5 leading-snug">{i.lectura}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex gap-1.5 flex-wrap">
          {SERIES.map((s) => (
            <button key={s.k} onClick={() => setSerie(s.k)} aria-pressed={serie === s.k}
              className={`px-2 py-1 text-xs border ${serie === s.k ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>{s.nombre}</button>
          ))}
        </div>
        <Grafico base={res.series.base} reciente={res.series.reciente} k={serie} />
        <p className="text-[11px] text-tenue">Línea celeste: últimos 60 días. Línea ocre punteada: mismo período del año anterior.</p>
      </div>
      <p className="text-[11px] text-tenue leading-relaxed">{res.metodo}</p>
    </div>
  );
}

function Grafico({ base, reciente, k }: { base: any[]; reciente: any[]; k: string }) {
  const W = 400, H = 150, P = 28;
  const todos = [...base, ...reciente].map((f) => f[k]).filter((v) => v !== null && Number.isFinite(v));
  if (todos.length < 2) return <p className="text-xs text-tenue my-4">Pocos datos sin nubes para graficar.</p>;
  let min = Math.min(...todos), max = Math.max(...todos);
  if (max - min < 0.02) { max += 0.01; min -= 0.01; }
  const x = (f: any, serie: any[]) => {
    const t0 = new Date(serie[0]?.fecha).getTime();
    const dia = (new Date(f.fecha).getTime() - t0) / 86400000;
    return P + (Math.max(0, Math.min(60, dia)) / 60) * (W - P - 8);
  };
  const y = (v: number) => H - 20 - ((v - min) / (max - min)) * (H - 34);
  const linea = (serie: any[]) => serie.filter((f) => f[k] !== null).map((f, i) => `${i ? "L" : "M"}${x(f, serie).toFixed(1)},${y(f[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3" role="img" aria-label="Evolución del índice en los dos períodos">
      {[min, (min + max) / 2, max].map((v) => (
        <g key={v}>
          <line x1={P} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#22405E" strokeWidth="0.5" />
          <text x={P - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fill="#8BA0B6" fontFamily="IBM Plex Mono">{v.toFixed(2)}</text>
        </g>
      ))}
      <text x={P} y={H - 4} fontSize="9" fill="#8BA0B6" fontFamily="IBM Plex Mono">día 0</text>
      <text x={W - 8} y={H - 4} fontSize="9" textAnchor="end" fill="#8BA0B6" fontFamily="IBM Plex Mono">día 60</text>
      <path d={linea(base)} fill="none" stroke="#C9A46A" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={linea(reciente)} fill="none" stroke="#8FE3F0" strokeWidth="2" />
      {reciente.filter((f) => f[k] !== null).map((f) => <circle key={f.fecha} cx={x(f, reciente)} cy={y(f[k])} r="2.5" fill="#8FE3F0" />)}
    </svg>
  );
}

function InformeDerrame({ r }: { r: ResultadoDerrame }) {
  return (
    <div className="p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="titulo text-2xl font-semibold">{r.tipo === "suelo" ? "Derrame en suelo" : "Mancha en agua"}</h2>
        <span className="px-2.5 py-1 text-sm font-semibold" style={{ background: COLOR_NIVEL[r.nivel], color: "#0A1628" }}>
          {r.nivel === "normal" ? "Sin indicios" : TEXTO_NIVEL[r.nivel]}
        </span>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="num text-3xl text-llama leading-none">{r.area_candidata_m2.toLocaleString("es-AR")}</p>
          <p className="text-xs text-tenue mt-1">m² candidatos</p>
        </div>
        <div>
          <p className="num text-xl leading-none">{(r.area_analizada_m2 / 10000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}</p>
          <p className="text-xs text-tenue mt-1">ha analizadas {r.tipo === "agua" ? "(solo agua)" : "(con datos)"}</p>
        </div>
      </div>
      <p className="text-sm leading-snug">{r.lectura}</p>
      <div className="flex flex-wrap gap-4 text-xs text-tenue">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3" style={{ background: "#FF2619" }} /> candidato</span>
        {r.tipo === "suelo" && <span className="flex items-center gap-1.5"><span className="w-3 h-3" style={{ background: "#FFB333" }} /> oscurecimiento leve</span>}
        {r.tipo === "agua" && <span className="flex items-center gap-1.5"><span className="w-3 h-3" style={{ background: "#2673D9" }} /> agua analizada</span>}
      </div>
      <p className="num text-[11px] text-tenue">
        Período {r.periodo.desde} a {r.periodo.hasta}{r.periodo.corte ? `, comparando antes y después del ${r.periodo.corte}` : ""}.
      </p>
      <p className="text-[11px] text-tenue leading-relaxed">{r.metodo} Es un indicio a verificar en campo, no una confirmación.</p>
    </div>
  );
}
