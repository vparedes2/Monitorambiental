import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import Globo, { setGeo } from "../components/Globo";
import { circuloKm } from "../lib/orbits";
import { Loader2, Crosshair, ListChecks, FileDown } from "lucide-react";
import { capturarMapa, generarInformePDF, nombreArchivo, type ItemLeyenda } from "../lib/exportar";
import { obtenerBarrido, conCache } from "../services/osmGeo";

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
  const [modo, setModo] = useState<"cambios" | "derrames" | "barrido">("cambios");
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

  const lugar = () => (punto ? `${punto.nombre ? punto.nombre + ", " : ""}${punto.lat.toFixed(5)}°, ${punto.lon.toFixed(5)}°, radio ${radio} m` : "");
  const fotoMapa = async () => { try { return mapRef.current ? await capturarMapa(mapRef.current) : undefined; } catch { return undefined; } };

  const exportarCambios = async () => {
    if (!res) return;
    const mapa = await fotoMapa();
    const fmt = (v: number | null, u?: string) => (v === null ? "N/D" : u ? v.toFixed(1) : v.toFixed(3));
    generarInformePDF({
      titulo: "Análisis satelital de suelo y agua",
      subtitulo: `${lugar()}. Resultado general: ${TEXTO_NIVEL[res.nivel_general]}.`,
      mapa,
      leyenda: [{ color: COLOR_NIVEL[res.nivel_general], texto: "Área analizada (color según resultado)" }, { color: "#C9A46A", texto: "Instalación del catastro", forma: "circulo" }],
      secciones: [
        { titulo: "Períodos comparados", texto: [`Reciente: ${res.periodos.reciente.desde} a ${res.periodos.reciente.hasta} (${res.periodos.reciente.escenas_validas} compuestos sin nubes). Base: ${res.periodos.base.desde} a ${res.periodos.base.hasta} (${res.periodos.base.escenas_validas}).`] },
        {
          titulo: "Indicadores",
          tabla: {
            columnas: ["Indicador", "Año anterior", "Ahora", "Unidad", "Resultado", "Lectura"],
            filas: res.indicadores.map((i) => [i.nombre, fmt(i.base, i.unidad), fmt(i.reciente, i.unidad), i.unidad || "índice", TEXTO_NIVEL[i.nivel], i.lectura])
          }
        },
        {
          titulo: "Serie de compuestos (últimos 60 días)",
          tabla: {
            columnas: ["Fecha", "NDVI", "NDWI", "NDMI", "BSI", "% agua", "% suelo desnudo"],
            filas: res.series.reciente.map((f: any) => [f.fecha, f.ndvi?.toFixed(3) ?? "-", f.ndwi?.toFixed(3) ?? "-", f.ndmi?.toFixed(3) ?? "-", f.bsi?.toFixed(3) ?? "-", f.agua !== null ? (f.agua * 100).toFixed(2) : "-", f.desnudo !== null ? (f.desnudo * 100).toFixed(2) : "-"])
          }
        }
      ],
      metodo: res.metodo,
      archivo: nombreArchivo("informe-suelo-agua", "pdf")
    });
  };

  const exportarDerrame = async () => {
    if (!resDerrame) return;
    const mapa = await fotoMapa();
    const leyenda: ItemLeyenda[] = [{ color: "#FF2619", texto: "Píxel candidato a derrame" }];
    if (resDerrame.tipo === "suelo") leyenda.push({ color: "#FFB333", texto: "Oscurecimiento leve" });
    else leyenda.push({ color: "#2673D9", texto: "Agua analizada" });
    generarInformePDF({
      titulo: resDerrame.tipo === "suelo" ? "Búsqueda de derrame en suelo" : "Búsqueda de mancha en agua",
      subtitulo: `${lugar()}. Resultado: ${resDerrame.nivel === "normal" ? "Sin indicios" : TEXTO_NIVEL[resDerrame.nivel]}.`,
      mapa,
      leyenda,
      secciones: [
        {
          titulo: "Resultado",
          tabla: {
            columnas: ["Área candidata", "Área analizada", "Período", "Nivel"],
            filas: [[`${resDerrame.area_candidata_m2.toLocaleString("es-AR")} m²`, `${(resDerrame.area_analizada_m2 / 10000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha`, `${resDerrame.periodo.desde} a ${resDerrame.periodo.hasta}${resDerrame.periodo.corte ? ` (corte ${resDerrame.periodo.corte})` : ""}`, resDerrame.nivel === "normal" ? "Sin indicios" : TEXTO_NIVEL[resDerrame.nivel]]]
          }
        },
        { titulo: "Lectura", texto: [resDerrame.lectura, "Es un indicio a verificar en campo, no una confirmación."] }
      ],
      metodo: resDerrame.metodo,
      archivo: nombreArchivo(`informe-derrame-${resDerrame.tipo}`, "pdf")
    });
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
        <Globo centro={[-68.95, -38.3]} zoom={8} onListo={(m) => { mapRef.current = m; setListo(true); }}
          tituloExport={modo === "cambios" ? "Análisis de suelo y agua" : "Búsqueda de derrames"}
          subtituloExport={punto ? `${punto.lat.toFixed(4)}°, ${punto.lon.toFixed(4)}°, radio ${radio} m` : undefined}
          leyendaExport={modo === "derrames" ? [{ color: "#FF2619", texto: "Píxel candidato a derrame" }, { color: "#C9A46A", texto: "Instalación del catastro", forma: "circulo" }] : [{ color: "#C9A46A", texto: "Instalación del catastro", forma: "circulo" }]} />
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
          {([["cambios", "Cambios"], ["derrames", "Derrames"], ["barrido", "Barridos"]] as const).map(([id, txt]) => (
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

        {modo === "barrido" && listo && <BarridoRio map={mapRef.current!} />}

        <div className={`p-5 border-b border-linea space-y-4 ${modo === "barrido" ? "hidden" : ""}`}>
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

        {modo === "cambios" && res && (
          <>
            <div className="px-5 pt-4"><BotonPdf onClick={exportarCambios} /></div>
            <Informe res={res} serie={serie} setSerie={setSerie} />
          </>
        )}
        {modo === "derrames" && resDerrame && (
          <>
            <div className="px-5 pt-4"><BotonPdf onClick={exportarDerrame} /></div>
            <InformeDerrame r={resDerrame} />
          </>
        )}

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

function BotonPdf({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-lutita text-lutita hover:bg-noche/40">
      <FileDown className="w-4 h-4" /> Exportar informe PDF
    </button>
  );
}

// ---------------------------------------------------------------------------
// Barrido del río Neuquén en la zona de Añelo
// ---------------------------------------------------------------------------
interface Tramo { n: number; km_desde_ref?: number; km_costa?: number; lat: number; lon: number }

const ZONAS = [
  { id: "anelo", corto: "Río Neuquén, Añelo" },
  { id: "rincon", corto: "Río Colorado, Rincón de los Sauces" },
  { id: "marimenuco", corto: "Costa lago Mari Menuco" },
  { id: "barreales", corto: "Costa lago Los Barreales" }
];
interface ResTramo {
  agua?: Indicador;
  humedad?: Indicador;
  mancha?: { nivel: Nivel; area: number };
  nivel: Nivel | "pendiente" | "error";
  error?: string;
}

function BarridoRio({ map }: { map: MLMap }) {
  const [zona, setZona] = useState("anelo");
  const [meta, setMeta] = useState<{ nombre: string; tipo: "rio" | "costa"; referencia: { nombre: string }; perimetro_km?: number } | null>(null);
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [res, setRes] = useState<Record<number, ResTramo>>({});
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuente, setFuente] = useState("");
  const cancelar = useRef(false);

  const dibujar = (ts: Tramo[], rs: Record<number, ResTramo>) => {
    setGeo(map, "barrido", {
      type: "FeatureCollection",
      features: ts.map((t) => {
        const r = rs[t.n];
        const color = !r || r.nivel === "pendiente" ? "#8BA0B6" : r.nivel === "error" ? "#55606E" : COLOR_NIVEL[r.nivel];
        return { type: "Feature", properties: { color, n: String(t.n) }, geometry: { type: "Polygon", coordinates: [circuloKm(t.lat, t.lon, 1)] } };
      })
    });
    if (!map.getLayer("barrido")) {
      map.addLayer({ id: "barrido", type: "fill", source: "barrido", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 } });
      map.addLayer({ id: "barrido-borde", type: "line", source: "barrido", paint: { "line-color": ["get", "color"], "line-width": 2 } });
    }
  };

  const iniciar = async () => {
    setError(null);
    setCorriendo(true);
    cancelar.current = false;
    try {
      // OpenStreetMap se consulta desde el navegador (con caché de 7 días); el servidor es el respaldo
      const d: any = await conCache(`barrido-${zona}-v3`, () => obtenerBarrido(zona), async () => {
        const r = await fetch(`/api/barrido/${zona}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        return j;
      });
      const ts: Tramo[] = d.tramos;
      setTramos(ts);
      setFuente(d.fuente);
      setMeta({ nombre: d.nombre, tipo: d.tipo, referencia: d.referencia, perimetro_km: d.perimetro_km });
      const inicial: Record<number, ResTramo> = {};
      ts.forEach((t) => { inicial[t.n] = { nivel: "pendiente" }; });
      setRes(inicial);
      dibujar(ts, inicial);
      const lons = ts.map((t) => t.lon), lats = ts.map((t) => t.lat);
      map.fitBounds([[Math.min(...lons) - 0.03, Math.min(...lats) - 0.03], [Math.max(...lons) + 0.03, Math.max(...lats) + 0.03]], { padding: 30, duration: 1200 });

      const acumulado = { ...inicial };
      const cola = [...ts];
      const trabajador = async () => {
        while (cola.length && !cancelar.current) {
          const t = cola.shift()!;
          try {
            const [a, b] = await Promise.all([
              fetch(`/api/analisis/suelo-agua?lat=${t.lat.toFixed(5)}&lon=${t.lon.toFixed(5)}&radio=1000`).then((x) => x.json()),
              fetch(`/api/derrames?tipo=agua&lat=${t.lat.toFixed(5)}&lon=${t.lon.toFixed(5)}&radio=1000`).then((x) => x.json())
            ]);
            if (a.error && b.error) throw new Error(a.error);
            const agua = a.indicadores?.find((i: Indicador) => i.id === "agua");
            const humedad = a.indicadores?.find((i: Indicador) => i.id === "humedad");
            const mancha = b.error ? undefined : { nivel: b.nivel as Nivel, area: b.area_candidata_m2 as number };
            const orden: Record<string, number> = { sin_datos: 0, normal: 1, observar: 2, alerta: 3 };
            const niveles = [agua?.nivel, humedad?.nivel, mancha?.nivel].filter(Boolean) as Nivel[];
            const peor = niveles.reduce<Nivel>((acc, n) => (orden[n] > orden[acc] ? n : acc), "sin_datos");
            acumulado[t.n] = { agua, humedad, mancha, nivel: peor };
          } catch (e: any) {
            acumulado[t.n] = { nivel: "error", error: e.message };
          }
          setRes({ ...acumulado });
          dibujar(ts, acumulado);
        }
      };
      await Promise.all([trabajador(), trabajador(), trabajador()]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCorriendo(false);
    }
  };

  const etiqueta = (t: Tramo) =>
    meta?.tipo === "costa"
      ? `Punto ${t.n} de la costa (km ${t.km_costa})`
      : `${(t.km_desde_ref ?? 0) > 0 ? "+" : ""}${t.km_desde_ref} km ${(t.km_desde_ref ?? 0) < 0 ? "aguas arriba" : "aguas abajo"} de ${meta?.referencia.nombre ?? ""}`;
  const hechos = tramos.filter((t) => res[t.n] && res[t.n].nivel !== "pendiente").length;
  const fmtPct = (i?: Indicador) => (i && i.base !== null && i.reciente !== null ? `${i.base.toFixed(1)} → ${i.reciente.toFixed(1)} %` : "N/D");

  const exportar = async () => {
    let mapa: HTMLCanvasElement | undefined;
    try { mapa = await capturarMapa(map); } catch { /* sin mapa */ }
    const alertas = tramos.filter((t) => res[t.n]?.nivel === "alerta").length;
    const observar = tramos.filter((t) => res[t.n]?.nivel === "observar").length;
    generarInformePDF({
      titulo: `Barrido satelital: ${meta?.nombre ?? ""}`,
      subtitulo: meta?.tipo === "costa"
        ? `${tramos.length} puntos repartidos sobre ${meta?.perimetro_km ?? "?"} km de costa, radio 1 km. ${alertas} en alerta, ${observar} para observar.`
        : `${tramos.length} tramos de 2 km a lo largo del cauce, centrados en ${meta?.referencia.nombre}. ${alertas} en alerta, ${observar} para observar.`,
      mapa,
      leyenda: [
        { color: COLOR_NIVEL.alerta, texto: "Alerta" }, { color: COLOR_NIVEL.observar, texto: "Observar" },
        { color: COLOR_NIVEL.normal, texto: "Sin cambios" }, { color: COLOR_NIVEL.sin_datos, texto: "Sin datos" }
      ],
      secciones: [{
        titulo: meta?.tipo === "costa" ? "Resultado por punto de costa" : "Resultado por tramo (oeste a este, aguas arriba a aguas abajo)",
        tabla: {
          columnas: [meta?.tipo === "costa" ? "Punto" : "Tramo", meta?.tipo === "costa" ? "km de costa" : `km desde ${meta?.referencia.nombre ?? ""}`, "Centro (lat, lon)", "Agua superficial (año ant. → ahora)", "Humedad del suelo", "Mancha en agua (radar)", "Resultado"],
          filas: tramos.map((t) => {
            const r = res[t.n] || { nivel: "pendiente" };
            return [t.n, meta?.tipo === "costa" ? String(t.km_costa) : `${(t.km_desde_ref ?? 0) > 0 ? "+" : ""}${t.km_desde_ref}`, `${t.lat.toFixed(4)}, ${t.lon.toFixed(4)}`, fmtPct(r.agua),
              r.humedad ? TEXTO_NIVEL[r.humedad.nivel] : "N/D", r.mancha ? (r.mancha.area ? `${r.mancha.area.toLocaleString("es-AR")} m²` : "Sin manchas") : "N/D",
              r.nivel === "pendiente" ? "Pendiente" : r.nivel === "error" ? "Error" : TEXTO_NIVEL[r.nivel]];
          })
        }
      }, {
        titulo: "Hallazgos",
        texto: tramos.filter((t) => ["alerta", "observar"].includes(res[t.n]?.nivel as string)).map((t) => {
          const r = res[t.n];
          return `${etiqueta(t)}: ${[r.agua?.nivel !== "normal" ? r.agua?.lectura : "", r.humedad?.nivel !== "normal" ? r.humedad?.lectura : "", r.mancha && r.mancha.nivel !== "normal" ? `Radar: ${r.mancha.area.toLocaleString("es-AR")} m² de agua anormalmente lisa.` : ""].filter(Boolean).join(" ")}`;
        }).concat(alertas + observar === 0 ? ["Sin hallazgos en los tramos analizados."] : [])
      }],
      metodo: `${fuente}. ${meta?.tipo === "costa" ? "Cada punto es un círculo de 1 km de radio sobre la línea de costa, repartidos en partes iguales a lo largo del perímetro." : "Cada tramo es un círculo de 1 km de radio centrado en el cauce, separados 2 km a lo largo del río."} Agua superficial y humedad: Sentinel-2 L2A, últimos 60 días vs. mismo período del año anterior. Manchas en agua: Sentinel-1 radar, última pasada vs. mediana de 36 días, descontando el oscurecimiento general por viento.`,
      archivo: nombreArchivo(`barrido-${zona}`, "pdf")
    });
  };

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {ZONAS.map((z) => (
          <button key={z.id} onClick={() => setZona(z.id)} disabled={corriendo} aria-pressed={zona === z.id}
            className={`text-left px-3 py-2 text-sm border ${zona === z.id ? "border-hielo text-hielo" : "border-linea"}`}>{z.corto}</button>
        ))}
      </div>
      <p className="text-sm text-tenue">
        {zona === "anelo" || zona === "rincon"
          ? "Recorre el cauce en 20 tramos de 2 km, 10 aguas arriba y 10 aguas abajo de la localidad."
          : "Recorre la costa del embalse en 20 puntos repartidos en partes iguales."}{" "}
        En cada uno mide agua superficial y humedad del suelo contra el año anterior y busca manchas en el agua con radar.
      </p>
      <button onClick={iniciar} disabled={corriendo}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-hielo text-noche font-semibold disabled:opacity-60">
        {corriendo && <Loader2 className="w-4 h-4 animate-spin" />}
        {corriendo ? `Analizando ${Math.min(hechos + 1, tramos.length || 20)} de ${tramos.length || 20}…` : `Iniciar barrido: ${ZONAS.find((z) => z.id === zona)!.corto}`}
      </button>
      {corriendo && <button onClick={() => { cancelar.current = true; }} className="text-xs text-tenue underline">Detener</button>}
      {error && <p className="text-xs text-llama">{error}</p>}
      {tramos.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3 text-xs">
            {(["alerta", "observar", "normal", "sin_datos"] as Nivel[]).map((n) => (
              <span key={n} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: COLOR_NIVEL[n] }} />
                {TEXTO_NIVEL[n]}: {tramos.filter((t) => res[t.n]?.nivel === n).length}</span>
            ))}
          </div>
          {!corriendo && hechos > 0 && <BotonPdf onClick={exportar} />}
          <ul className="divide-y divide-linea border-y border-linea">
            {tramos.map((t) => {
              const r = res[t.n];
              const color = !r || r.nivel === "pendiente" ? "#22405E" : r.nivel === "error" ? "#55606E" : COLOR_NIVEL[r.nivel];
              return (
                <li key={t.n}>
                  <button onClick={() => map.flyTo({ center: [t.lon, t.lat], zoom: 13, duration: 1000 })} className="w-full text-left py-2.5 px-1 flex gap-3 hover:bg-noche/40">
                    <span className="num text-xs w-6 text-tenue mt-0.5">{t.n}</span>
                    <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="flex-1 text-sm">
                      <span className="block">{etiqueta(t)}</span>
                      {r && r.nivel === "pendiente" && <span className="block text-xs text-tenue">Pendiente</span>}
                      {r && r.nivel === "error" && <span className="block text-xs text-llama">Error: {r.error}</span>}
                      {r && r.agua && (
                        <span className="block text-xs text-tenue">
                          Agua {fmtPct(r.agua)} · humedad {r.humedad ? TEXTO_NIVEL[r.humedad.nivel].toLowerCase() : "N/D"} · radar {r.mancha ? (r.mancha.area ? `${r.mancha.area.toLocaleString("es-AR")} m²` : "sin manchas") : "N/D"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-tenue">{fuente}. Tocá un tramo para ir a él en el mapa.</p>
        </>
      )}
    </div>
  );
}
