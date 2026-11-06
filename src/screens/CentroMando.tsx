import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import { motion, AnimatePresence } from "motion/react";
import Globo, { setGeo } from "../components/Globo";
import { useFirms, useTle, parseFechaFirms, usePrefiereMenosMovimiento } from "../lib/useData";
import { prepararSatelites, posicion, proximaPasada, fmtCuenta, ANELO } from "../lib/orbits";
import { SkipForward, RotateCcw } from "lucide-react";

const ACTOS = [
  { t: 0, titulo: "Órbita baja", detalle: "Vista desde ~830 km, la altura de los satélites VIIRS" },
  { t: 0.3, titulo: "Sudamérica", detalle: "Descenso sobre el cono sur" },
  { t: 0.62, titulo: "Cuenca Neuquina", detalle: "Recuadro de vigilancia: 3° × 2,5°" },
  { t: 0.9, titulo: "Vaca Muerta", detalle: "Focos térmicos detectados por NASA FIRMS" }
];
const DURACION_MS = 11000;

export default function CentroMando({ irA }: { irA: (r: string) => void }) {
  const { focos, estado, catastro } = useFirms();
  const { satelites } = useTle();
  const reduce = usePrefiereMenosMovimiento();
  const mapRef = useRef<MLMap | null>(null);
  const [listo, setListo] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [aterrizado, setAterrizado] = useState(false);
  const [ahora, setAhora] = useState(new Date());
  const marcadores = useRef<Record<string, maplibregl.Marker>>({});

  const sats = useMemo(() => prepararSatelites(satelites), [satelites]);

  // Reloj de 1 s para satélites y cuentas regresivas
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Secuencia cinematográfica
  const iniciarVuelo = (map: MLMap) => {
    setAterrizado(false);
    map.jumpTo({ center: [-42, -18], zoom: 1.15, pitch: 0, bearing: 0 });
    if (reduce) {
      map.jumpTo({ center: [-68.95, -38.25], zoom: 7.6, pitch: 45, bearing: -12 });
      setProgreso(1);
      setAterrizado(true);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / DURACION_MS);
      setProgreso(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    map.easeTo({ center: [-58, -28], zoom: 2.1, duration: 3200, easing: (x) => x * (2 - x) });
    map.once("moveend", () => {
      map.flyTo({ center: [-68.95, -38.25], zoom: 7.6, pitch: 52, bearing: -14, duration: DURACION_MS - 3400, curve: 1.5, essential: true });
      map.once("moveend", () => {
        cancelAnimationFrame(raf);
        setProgreso(1);
        setAterrizado(true);
      });
    });
  };

  const alListo = (map: MLMap) => {
    mapRef.current = map;
    setListo(true);
    iniciarVuelo(map);
  };

  const saltar = () => {
    const map = mapRef.current;
    if (!map) return;
    map.stop();
    map.jumpTo({ center: [-68.95, -38.25], zoom: 7.6, pitch: 52, bearing: -14 });
    setProgreso(1);
    setAterrizado(true);
  };

  // Focos térmicos en el mapa con halo que respira
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: focos.map((f) => ({
        type: "Feature",
        properties: { frp: f.frp, match: f.match },
        geometry: { type: "Point", coordinates: [f.lon, f.lat] }
      }))
    };
    setGeo(map, "focos", fc);
    if (!map.getLayer("focos-halo")) {
      map.addLayer({
        id: "focos-halo", type: "circle", source: "focos",
        paint: {
          "circle-color": "#FF8A3D", "circle-opacity": 0.25, "circle-blur": 0.9,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 4, 8, ["+", 10, ["*", 2, ["get", "frp"]]]]
        }
      });
      map.addLayer({
        id: "focos-nucleo", type: "circle", source: "focos",
        paint: {
          "circle-color": ["case", ["get", "match"], "#FFD3A8", "#FF8A3D"],
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 1.5, 8, 4],
          "circle-stroke-color": "#0A1628", "circle-stroke-width": 1
        }
      });
    }
    if (reduce) return;
    let raf = 0;
    const t0 = performance.now();
    const latido = () => {
      const k = 0.5 + 0.5 * Math.sin((performance.now() - t0) / 600);
      if (map.getLayer("focos-halo")) map.setPaintProperty("focos-halo", "circle-opacity", 0.15 + 0.25 * k);
      raf = requestAnimationFrame(latido);
    };
    raf = requestAnimationFrame(latido);
    return () => cancelAnimationFrame(raf);
  }, [focos, listo, reduce]);

  // Satélites reales como marcadores que se mueven
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    for (const s of sats) {
      const p = posicion(s.satrec, ahora);
      if (!p) continue;
      let m = marcadores.current[s.id];
      if (!m) {
        const el = document.createElement("div");
        el.className = "flex items-center gap-1.5 pointer-events-none";
        el.innerHTML = `<span style="width:9px;height:9px;border:2px solid #8FE3F0;transform:rotate(45deg);display:block;background:#0A1628"></span><span style="font:500 11px 'IBM Plex Mono',monospace;color:#8FE3F0;text-shadow:0 0 6px #0A1628">${s.nombre}</span>`;
        m = new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([p.lon, p.lat]).addTo(map);
        marcadores.current[s.id] = m;
      } else {
        m.setLngLat([p.lon, p.lat]);
      }
    }
  }, [ahora, sats, listo]);

  const pasadas = useMemo(() => {
    return sats
      .map((s) => ({ s, pas: proximaPasada(s.satrec, new Date()) }))
      .filter((x) => x.pas)
      .sort((a, b) => a.pas!.inicio.getTime() - b.pas!.inicio.getTime());
    // se recalcula cada minuto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sats, Math.floor(ahora.getTime() / 60000)]);

  // Histograma de focos por bloques de 6 h
  const histo = useMemo(() => {
    const ahoraMs = Date.now();
    const bins = new Array(8).fill(0);
    for (const f of focos) {
      const d = parseFechaFirms(f.fecha);
      if (!d) continue;
      const h = (ahoraMs - d.getTime()) / 3600000;
      const i = 7 - Math.min(7, Math.max(0, Math.floor(h / 6)));
      bins[i]++;
    }
    return bins;
  }, [focos]);
  const maxBin = Math.max(1, ...histo);
  const frpTotal = focos.reduce((a, f) => a + f.frp, 0);
  const sinCatastro = focos.filter((f) => !f.match).length;

  const actoActual = [...ACTOS].reverse().find((a) => progreso >= a.t) ?? ACTOS[0];
  const timecode = (p: number) => {
    const ms = p * DURACION_MS;
    const s = Math.floor(ms / 1000);
    return `00:${String(s).padStart(2, "0")}:${String(Math.floor((ms % 1000) / 41.7)).padStart(2, "0")}`;
  };

  return (
    <div className="relative">
      {/* Escenario del globo */}
      <section className="relative h-[78vh] min-h-[520px] lg:h-[calc(100vh-0px)] overflow-hidden bg-noche" aria-label="Globo terrestre con focos térmicos de Vaca Muerta">
        <Globo centro={[-42, -18]} zoom={1.15} onListo={alListo} />

        {/* Viñeta para legibilidad */}
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 45%, rgba(10,22,40,.75) 100%), linear-gradient(to bottom, rgba(10,22,40,.85) 0%, transparent 32%, transparent 78%, rgba(10,22,40,.9) 100%)" }} />

        {/* Rótulo cinematográfico */}
        <div className="pointer-events-none absolute left-5 top-5 sm:left-8 sm:top-8 max-w-[34rem]">
          <p className="num text-[11px] text-hielo/80">Monitor ambiental Vaca Muerta</p>
          <AnimatePresence mode="wait">
            <motion.div
              key={actoActual.titulo}
              initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="titulo text-5xl sm:text-7xl font-semibold leading-[0.95] text-texto mt-1">{actoActual.titulo}</h1>
              <p className="text-tenue text-sm sm:text-base mt-2">
                {actoActual.titulo === "Vaca Muerta" && estado?.estado === "ok"
                  ? `${focos.length} focos térmicos reales en las últimas 48 h`
                  : actoActual.detalle}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Línea de tiempo tipo editor de video */}
        <div className="absolute left-4 right-4 bottom-10 sm:left-8 sm:right-8 sm:bottom-10">
          <div className="flex items-center gap-3">
            <span className="num text-xs text-hielo w-[74px]">{timecode(progreso)}</span>
            <div className="relative flex-1 h-8">
              <div className="absolute inset-x-0 top-1/2 h-px bg-linea" />
              <div className="absolute left-0 top-1/2 h-[2px] -translate-y-px bg-hielo" style={{ width: `${progreso * 100}%` }} />
              {ACTOS.map((a, i) => (
                <div key={a.titulo} className="absolute top-0 -translate-x-1/2 flex flex-col items-center" style={{ left: `${a.t * 100 + (i === 0 ? 1 : 0)}%` }}>
                  <span className={`block w-2 h-2 rotate-45 border ${progreso >= a.t ? "bg-hielo border-hielo" : "bg-noche border-linea"}`} style={{ marginTop: 12 }} />
                  <span className={`hidden sm:block num text-[10px] mt-1.5 whitespace-nowrap ${progreso >= a.t ? "text-texto" : "text-tenue"}`}>{a.titulo}</span>
                </div>
              ))}
            </div>
            {aterrizado ? (
              <button onClick={() => mapRef.current && iniciarVuelo(mapRef.current)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-hielo border border-linea bg-noche/80 hover:border-hielo">
                <RotateCcw className="w-3.5 h-3.5" /> Repetir vuelo
              </button>
            ) : (
              <button onClick={saltar} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-hielo border border-linea bg-noche/80 hover:border-hielo">
                <SkipForward className="w-3.5 h-3.5" /> Saltar
              </button>
            )}
          </div>
        </div>

        {/* Panel de lectura al aterrizar (escritorio) */}
        <AnimatePresence>
          {aterrizado && (
            <motion.aside
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="hidden lg:block absolute right-8 top-8 w-[340px] instrumento p-5"
            >
              <PanelLectura {...{ focos: focos.length, frpTotal, sinCatastro, catastro, estado, histo, maxBin, irA }} />
            </motion.aside>
          )}
        </AnimatePresence>
      </section>

      {/* Panel de lectura en móvil */}
      <div className="lg:hidden px-4 py-5 instrumento mx-3 -mt-2 relative z-10">
        <PanelLectura {...{ focos: focos.length, frpTotal, sinCatastro, catastro, estado, histo, maxBin, irA }} />
      </div>

      {/* Próximas pasadas */}
      <section className="px-4 sm:px-8 py-8 max-w-6xl">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h2 className="titulo text-3xl font-semibold">Próximas pasadas sobre {ANELO.nombre}</h2>
          <button onClick={() => irA("orbitas")} className="text-sm text-hielo hover:underline">Ver órbitas en vivo</button>
        </div>
        <p className="text-tenue text-sm mt-1">Calculadas con los elementos orbitales publicados por CelesTrak. Se considera pasada cuando el satélite supera 10° sobre el horizonte.</p>
        <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {pasadas.length === 0 && <p className="text-tenue text-sm">Cargando órbitas…</p>}
          {pasadas.slice(0, 4).map(({ s, pas }) => (
            <div key={s.id} className="instrumento p-4">
              <p className="titulo text-xl font-semibold">{s.nombre}</p>
              <p className="text-xs text-tenue">{s.rol}</p>
              <p className="num text-2xl text-hielo mt-3">{pas!.enCurso ? "Sobre la cuenca" : fmtCuenta(pas!.inicio.getTime() - ahora.getTime())}</p>
              <p className="num text-[11px] text-tenue mt-1">
                a las {pas!.inicio.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} h, hasta {Math.round(pas!.maxElev)}° de elevación
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PanelLectura({ focos, frpTotal, sinCatastro, catastro, estado, histo, maxBin, irA }: any) {
  return (
    <div>
      <p className="text-xs text-tenue">Últimas 48 h, NASA FIRMS (VIIRS 375 m)</p>
      <div className="flex items-end gap-6 mt-2">
        <div>
          <p className="num text-5xl text-llama leading-none">{focos}</p>
          <p className="text-xs text-tenue mt-1">focos térmicos</p>
        </div>
        <div>
          <p className="num text-2xl text-texto leading-none">{frpTotal.toFixed(1)}</p>
          <p className="text-xs text-tenue mt-1">MW de potencia radiativa</p>
        </div>
      </div>

      {/* Histograma de 48 h */}
      <svg viewBox="0 0 240 70" className="w-full mt-4" role="img" aria-label="Focos por bloques de 6 horas">
        {histo.map((v: number, i: number) => {
          const h = (v / maxBin) * 52;
          return (
            <g key={i}>
              <motion.rect
                x={i * 30 + 4} width={22} rx={1}
                initial={{ y: 56, height: 0 }}
                animate={{ y: 56 - h, height: h }}
                transition={{ delay: 0.15 + i * 0.06, duration: 0.6 }}
                fill={i === histo.length - 1 ? "#FF8A3D" : "#8FE3F0"} opacity={i === histo.length - 1 ? 1 : 0.55}
              />
              <text x={i * 30 + 15} y={68} textAnchor="middle" fontSize="8" fill="#8BA0B6" fontFamily="IBM Plex Mono">{i === 7 ? "ahora" : `-${(7 - i) * 6}h`}</text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 pt-4 border-t border-linea text-sm space-y-1.5">
        {catastro === 0 ? (
          <p className="text-tenue">Sin catastro cargado: los focos todavía no se asocian a instalaciones.</p>
        ) : (
          <p><span className="num text-lutita">{sinCatastro}</span> <span className="text-tenue">focos sin instalación cargada cerca</span></p>
        )}
        {estado && estado.estado !== "ok" && <p className="text-llama text-xs">{estado.mensaje}</p>}
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => irA("focos")} className="flex-1 px-3 py-2 text-sm bg-llama text-noche font-semibold hover:brightness-110">Analizar focos</button>
        <button onClick={() => irA("focos")} className="px-3 py-2 text-sm border border-linea hover:border-lutita text-lutita">Cargar catastro</button>
      </div>
    </div>
  );
}
