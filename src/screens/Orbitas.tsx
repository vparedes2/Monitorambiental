import React, { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import Globo, { setGeo } from "../components/Globo";
import { useTle } from "../lib/useData";
import { prepararSatelites, posicion, trazaTerrestre, circuloKm, proximaPasada, fmtCuenta, ANELO } from "../lib/orbits";
import { Crosshair } from "lucide-react";

const COLOR: Record<string, string> = {
  VIIRS: "#FF8A3D",
  MSI: "#8FE3F0",
  TROPOMI: "#C9A46A"
};

export default function Orbitas() {
  const { satelites, error } = useTle();
  const sats = useMemo(() => prepararSatelites(satelites), [satelites]);
  const fallidos = satelites.filter((s) => !s.tle1);
  const mapRef = useRef<MLMap | null>(null);
  const [listo, setListo] = useState(false);
  const [ahora, setAhora] = useState(new Date());
  const [sel, setSel] = useState<string>("noaa21");
  const [seguir, setSeguir] = useState(false);
  const marcadores = useRef<Record<string, maplibregl.Marker>>({});

  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const elegido = sats.find((s) => s.id === sel) ?? sats[0];

  // Al cargar, centrar el globo en el satélite elegido
  const centrado = useRef(false);
  useEffect(() => {
    if (!listo || !elegido || centrado.current) return;
    const p = posicion(elegido.satrec, new Date());
    if (p) { mapRef.current?.jumpTo({ center: [p.lon, Math.max(-60, Math.min(60, p.lat))], zoom: 1.8 }); centrado.current = true; }
  }, [listo, elegido]);

  // Capas fijas: Añelo
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    setGeo(map, "anelo", { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [ANELO.lon, ANELO.lat] } });
    if (!map.getLayer("anelo")) {
      map.addLayer({ id: "anelo", type: "circle", source: "anelo", paint: { "circle-radius": 5, "circle-color": "#C9A46A", "circle-stroke-color": "#0A1628", "circle-stroke-width": 2 } });
    }
  }, [listo]);

  // Trazas del satélite elegido (se recalculan cada minuto)
  const minuto = Math.floor(ahora.getTime() / 60000);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo || !elegido) return;
    const t = new Date();
    const pasado = trazaTerrestre(elegido.satrec, new Date(t.getTime() - 45 * 60000), 45);
    const futuro = trazaTerrestre(elegido.satrec, t, 100);
    const color = COLOR[elegido.instrumento] ?? "#8FE3F0";
    setGeo(map, "traza-pasado", { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: pasado } });
    setGeo(map, "traza-futuro", { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: futuro } });
    if (!map.getLayer("traza-pasado")) {
      map.addLayer({ id: "traza-pasado", type: "line", source: "traza-pasado", paint: { "line-color": color, "line-width": 1.5, "line-opacity": 0.35 } });
      map.addLayer({ id: "traza-futuro", type: "line", source: "traza-futuro", paint: { "line-color": color, "line-width": 2, "line-dasharray": [2, 1.5] } });
    } else {
      map.setPaintProperty("traza-pasado", "line-color", color);
      map.setPaintProperty("traza-futuro", "line-color", color);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, elegido?.id, minuto]);

  // Posiciones cada segundo + franja de barrido del elegido
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    for (const s of sats) {
      const p = posicion(s.satrec, ahora);
      if (!p) continue;
      const color = COLOR[s.instrumento] ?? "#8FE3F0";
      let m = marcadores.current[s.id];
      if (!m) {
        const el = document.createElement("button");
        el.type = "button";
        el.setAttribute("aria-label", `Seleccionar ${s.nombre}`);
        el.style.cssText = "display:flex;align-items:center;gap:6px;background:none;border:0;cursor:pointer;padding:0";
        el.innerHTML = `<span style="width:10px;height:10px;border:2px solid ${color};transform:rotate(45deg);display:block;background:#0A1628"></span><span style="font:500 11px 'IBM Plex Mono',monospace;color:${color};text-shadow:0 0 6px #0A1628">${s.nombre}</span>`;
        el.addEventListener("click", () => setSel(s.id));
        m = new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat([p.lon, p.lat]).addTo(map);
        marcadores.current[s.id] = m;
      } else {
        m.setLngLat([p.lon, p.lat]);
      }
      if (s.id === elegido?.id) {
        setGeo(map, "franja", { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circuloKm(p.lat, p.lon, s.franja_km / 2)] } });
        if (!map.getLayer("franja")) {
          map.addLayer({ id: "franja", type: "fill", source: "franja", paint: { "fill-color": color, "fill-opacity": 0.12 } }, "anelo");
          map.addLayer({ id: "franja-borde", type: "line", source: "franja", paint: { "line-color": color, "line-width": 1, "line-opacity": 0.6 } }, "anelo");
        } else {
          map.setPaintProperty("franja", "fill-color", color);
          map.setPaintProperty("franja-borde", "line-color", color);
        }
        if (seguir) map.easeTo({ center: [p.lon, p.lat], duration: 900 });
      }
    }
  }, [ahora, sats, listo, elegido?.id, seguir]);

  const posEleg = elegido ? posicion(elegido.satrec, ahora) : null;
  const pasada = useMemo(() => (elegido ? proximaPasada(elegido.satrec, new Date()) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [elegido?.id, minuto]);

  return (
    <div className="flex flex-col lg:flex-row lg:h-screen">
      <section className="relative h-[62vh] lg:h-auto lg:flex-1" aria-label="Globo con las órbitas de los satélites">
        <Globo centro={[-62, -30]} zoom={1.6} onListo={(m) => { mapRef.current = m; setListo(true); }}
          tituloExport="Órbitas de los satélites de monitoreo"
          subtituloExport={elegido ? `Traza y franja de ${elegido.nombre}` : undefined}
          leyendaExport={[{ color: "#FF8A3D", texto: "VIIRS: focos térmicos" }, { color: "#8FE3F0", texto: "Sentinel-2: imagen óptica" }, { color: "#C9A46A", texto: "Sentinel-5P: gases" }, { color: "#8FE3F0", texto: "Recorrido próximos 100 min", forma: "linea" }]} />
        <div className="absolute left-4 top-4 sm:left-6 sm:top-6 pointer-events-none">
          <h1 className="titulo text-4xl sm:text-5xl font-semibold">Órbitas en vivo</h1>
          <p className="text-tenue text-sm mt-1 max-w-sm">Posición actual calculada con los elementos orbitales de CelesTrak. La línea punteada es el recorrido de los próximos 100 minutos.</p>
        </div>
        {elegido && (
          <button
            onClick={() => setSeguir((v) => !v)}
            aria-pressed={seguir}
            className={`absolute right-4 top-4 flex items-center gap-1.5 px-3 py-1.5 text-xs border ${seguir ? "bg-hielo text-noche border-hielo" : "bg-noche/80 text-hielo border-linea"}`}
          >
            <Crosshair className="w-3.5 h-3.5" /> {seguir ? "Siguiendo" : "Seguir"} {elegido.nombre}
          </button>
        )}
      </section>

      <aside className="lg:w-[380px] lg:overflow-y-auto border-l border-linea bg-panel/60">
        {elegido && posEleg && (
          <div className="p-5 border-b border-linea">
            <p className="text-xs text-tenue">{elegido.rol}, instrumento {elegido.instrumento}</p>
            <h2 className="titulo text-3xl font-semibold mt-0.5" style={{ color: COLOR[elegido.instrumento] }}>{elegido.nombre}</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4">
              <Dato k="Altitud" v={`${posEleg.altKm.toFixed(0)} km`} />
              <Dato k="Velocidad" v={`${(posEleg.velKms * 3600).toLocaleString("es-AR", { maximumFractionDigits: 0 })} km/h`} />
              <Dato k="Latitud" v={`${posEleg.lat.toFixed(3)}°`} />
              <Dato k="Longitud" v={`${posEleg.lon.toFixed(3)}°`} />
              <Dato k="Franja observada" v={`${elegido.franja_km.toLocaleString("es-AR")} km`} />
              <Dato k={`Próx. pasada ${ANELO.nombre}`} v={pasada ? (pasada.enCurso ? "Ahora" : fmtCuenta(pasada.inicio.getTime() - ahora.getTime())) : "> 24 h"} acento />
            </dl>
          </div>
        )}
        <ul className="divide-y divide-linea">
          {sats.map((s) => {
            const p = posicion(s.satrec, ahora);
            const activo = s.id === elegido?.id;
            return (
              <li key={s.id}>
                <button
                  onClick={() => { setSel(s.id); if (p) mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: 2.2, duration: 1600 }); }}
                  className={`w-full text-left px-5 py-3 flex items-center gap-3 ${activo ? "bg-noche/70" : "hover:bg-noche/40"}`}
                >
                  <span className="w-2.5 h-2.5 rotate-45 border-2 shrink-0" style={{ borderColor: COLOR[s.instrumento] }} />
                  <span className="flex-1">
                    <span className="block font-medium">{s.nombre}</span>
                    <span className="block text-xs text-tenue">{s.rol}</span>
                  </span>
                  {p && <span className="num text-xs text-tenue">{p.lat.toFixed(1)}°, {p.lon.toFixed(1)}°</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {(error || fallidos.length > 0) && (
          <p className="px-5 py-3 text-xs text-llama">
            {error ? `No se pudieron cargar las órbitas: ${error}` : `Sin elementos orbitales para: ${fallidos.map((f) => f.nombre).join(", ")}.`}
          </p>
        )}
        <p className="px-5 py-4 text-xs text-tenue">
          Naranja: VIIRS (detecta los focos térmicos). Celeste: Sentinel-2 (imagen óptica 10 m). Ocre: Sentinel-5P (metano, escala regional).
        </p>
      </aside>
    </div>
  );
}

function Dato({ k, v, acento }: { k: string; v: string; acento?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-tenue">{k}</dt>
      <dd className={`num text-lg ${acento ? "text-hielo" : "text-texto"}`}>{v}</dd>
    </div>
  );
}
