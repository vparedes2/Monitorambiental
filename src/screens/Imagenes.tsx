import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import Globo, { setGeo } from "../components/Globo";
import { useFirms } from "../lib/useData";
import Catalogo from "./Catalogo";
import { Loader2, Download } from "lucide-react";

interface Capa {
  id: string;
  nombre: string;
  satelite: string;
  resolucion: string;
  muestra: string;
  dias: number;
  leyenda?: { colores: string; min: string; max: string };
  categorias?: { color: string; texto: string }[];
}

const CAPAS: Capa[] = [
  {
    id: "swir", nombre: "Antorchas e infrarrojo", satelite: "Sentinel-2", resolucion: "20 m", dias: 10,
    categorias: [
      { color: "#FFE14D", texto: "Llama o suelo muy caliente (punto amarillo/rojo brillante; acercate para verlo)" },
      { color: "#0B0D12", texto: "Agua profunda (embalses, lagos)" },
      { color: "#3D63C9", texto: "Agua poco profunda, humedad, vegetación de ribera" },
      { color: "#5FD0F0", texto: "Nieve o hielo" },
      { color: "#B9D86A", texto: "Vegetación (mallines, pasturas)" },
      { color: "#8E8AA8", texto: "Suelo desnudo, estepa, locaciones" },
      { color: "#F2F4F7", texto: "Nubes" }
    ],
    muestra: "Combina bandas de infrarrojo de onda corta. Las llamas de antorchas y los suelos muy calientes aparecen como puntos amarillos o rojos brillantes; la vegetación se ve azul y el suelo desnudo en tonos claros."
  },
  {
    id: "termico", nombre: "Temperatura de superficie", satelite: "Sentinel-3 SLSTR", resolucion: "1 km", dias: 2,
    muestra: "Sensor térmico real (10,8 µm): temperatura de brillo del terreno en kelvin. Sirve para ver calor a escala de yacimiento, no de locación.",
    leyenda: { colores: "linear-gradient(90deg,#1a2673,#338cc9,#f2d959,#ff731a,#d90d0d)", min: "265 K (-8 °C)", max: "330 K (57 °C)" }
  },
  {
    id: "metano", nombre: "Metano (CH₄)", satelite: "Sentinel-5P TROPOMI", resolucion: "5,5 × 7 km", dias: 10,
    muestra: "Concentración de metano en la columna de aire. Muestra tendencias regionales; un píxel cubre decenas de pozos, así que no identifica una fuga puntual. Puede tener huecos sin dato.",
    leyenda: { colores: "linear-gradient(90deg,#26338c,#3399bf,#f2d959,#ff731a,#cc0d1a)", min: "1820 ppb", max: "1980 ppb" }
  },
  {
    id: "no2", nombre: "Dióxido de nitrógeno (NO₂)", satelite: "Sentinel-5P TROPOMI", resolucion: "5,5 × 3,5 km", dias: 7,
    muestra: "Gas de combustión: motores, compresores, antorchas y tránsito pesado. Las zonas con mucha actividad de equipos suelen verse más cargadas. Escala regional.",
    leyenda: { colores: "linear-gradient(90deg,#26338c,#3399bf,#f2d959,#ff731a,#cc0d1a)", min: "0", max: "200 µmol/m²" }
  },
  {
    id: "so2", nombre: "Dióxido de azufre (SO₂)", satelite: "Sentinel-5P TROPOMI", resolucion: "5,5 × 3,5 km", dias: 7,
    muestra: "Asociado a quema de gas con azufre (gas ácido) y a fuentes industriales. Señal débil y ruidosa a nivel local: tomar como indicio regional.",
    leyenda: { colores: "linear-gradient(90deg,#26338c,#3399bf,#f2d959,#ff731a,#cc0d1a)", min: "0", max: "2 mmol/m²" }
  },
  {
    id: "co", nombre: "Monóxido de carbono (CO)", satelite: "Sentinel-5P TROPOMI", resolucion: "5,5 × 7 km", dias: 7,
    muestra: "Producto de combustión incompleta: antorchas ineficientes e incendios. Se transporta lejos con el viento, por eso es regional.",
    leyenda: { colores: "linear-gradient(90deg,#26338c,#3399bf,#f2d959,#ff731a,#cc0d1a)", min: "20 mmol/m²", max: "50 mmol/m²" }
  },
  {
    id: "radar", nombre: "Radar", satelite: "Sentinel-1", resolucion: "10 m", dias: 12,
    categorias: [
      { color: "#FFFFFF", texto: "Estructuras metálicas, equipos, tanques, relieve de frente al satélite" },
      { color: "#7A7F88", texto: "Suelo y vegetación (rugosidad media)" },
      { color: "#0B0D12", texto: "Agua calma, superficies muy lisas" }
    ],
    muestra: "Imagen de radar: funciona de noche y a través de las nubes. Las estructuras metálicas (tanques, equipos, cañerías) rebotan la señal y se ven muy brillantes."
  },
  {
    id: "vegetacion", nombre: "Vegetación (NDVI)", satelite: "Sentinel-2", resolucion: "10 m", dias: 15,
    muestra: "Índice de vigor vegetal. Útil para ver desmontes, picadas nuevas y daño en la cubierta vegetal alrededor de locaciones.",
    leyenda: { colores: "linear-gradient(90deg,#8c7359,#d9bf8c,#99cc59,#269933,#005a1a)", min: "suelo desnudo", max: "vegetación densa" }
  },
  {
    id: "agua", nombre: "Agua y humedad (NDWI)", satelite: "Sentinel-2", resolucion: "10 m", dias: 15,
    muestra: "Resalta cuerpos de agua y suelo húmedo: piletas, derrames de agua de retorno, ríos y bajos inundables.",
    leyenda: { colores: "linear-gradient(90deg,#1f1f1f,#59544d,#8cccf2,#1a73d9,#00268c)", min: "seco", max: "agua" }
  },
  {
    id: "color", nombre: "Color natural", satelite: "Sentinel-2", resolucion: "10 m", dias: 15,
    muestra: "Como una foto: la mejor escena con menos nubes del período."
  }
];

const CUENCA_BBOX: [number, number, number, number] = [-70.5, -39.5, -67.5, -37];

export default function Imagenes() {
  const mapRef = useRef<MLMap | null>(null);
  const [listo, setListo] = useState(false);
  const [capaId, setCapaId] = useState("swir");
  const [dias, setDias] = useState(10);
  const [area, setArea] = useState<"cuenca" | "vista">("cuenca");
  const [opacidad, setOpacidad] = useState(0.9);
  const [verFocos, setVerFocos] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [leyendaAbierta, setLeyendaAbierta] = useState(true);
  const { focos } = useFirms();

  const capa = CAPAS.find((c) => c.id === capaId)!;

  const elegirCapa = (c: Capa) => {
    setCapaId(c.id);
    setDias(c.dias);
  };

  const generar = async () => {
    const map = mapRef.current;
    if (!map) return;
    let bbox = CUENCA_BBOX;
    if (area === "vista") {
      const b = map.getBounds();
      bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    }
    const [w, s, e, n] = bbox;
    const ratio = ((e - w) * Math.cos((((s + n) / 2) * Math.PI) / 180)) / (n - s);
    const ancho = 1200;
    const alto = Math.round(Math.min(1400, Math.max(200, ancho / ratio)));
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`/api/imagen?capa=${capaId}&dias=${dias}&bbox=${bbox.map((x) => x.toFixed(4)).join(",")}&w=${ancho}&h=${alto}`);
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Error ${r.status}`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      if (imagenUrl) URL.revokeObjectURL(imagenUrl);
      setImagenUrl(url);
      const coords: [[number, number], [number, number], [number, number], [number, number]] = [[w, n], [e, n], [e, s], [w, s]];
      const src = map.getSource("imagen") as maplibregl.ImageSource | undefined;
      if (src) src.updateImage({ url, coordinates: coords });
      else {
        map.addSource("imagen", { type: "image", url, coordinates: coords });
        map.addLayer({ id: "imagen", type: "raster", source: "imagen", paint: { "raster-opacity": opacidad, "raster-fade-duration": 300 } }, map.getLayer("cuenca-relleno") ? "cuenca-relleno" : undefined);
      }
      setInfo(`${capa.nombre}, ${capa.satelite}, últimos ${dias} días`);
      if (area === "cuenca") map.fitBounds([[w, s], [e, n]], { padding: 30, duration: 900 });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  // Primera imagen al abrir la pantalla
  useEffect(() => {
    if (listo) generar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer("imagen")) map.setPaintProperty("imagen", "raster-opacity", opacidad);
  }, [opacidad]);

  // Focos térmicos superpuestos
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    setGeo(map, "focos-img", {
      type: "FeatureCollection",
      features: verFocos ? focos.map((f) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [f.lon, f.lat] } })) : []
    });
    if (!map.getLayer("focos-img")) {
      map.addLayer({ id: "focos-img", type: "circle", source: "focos-img", paint: { "circle-radius": 5, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#FF8A3D", "circle-stroke-width": 2 } });
    }
  }, [focos, verFocos, listo]);

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:h-screen">
        <aside className="lg:w-[360px] lg:overflow-y-auto border-r border-linea bg-panel/60 order-2 lg:order-1">
          <div className="p-5 border-b border-linea">
            <h1 className="titulo text-4xl font-semibold">Imágenes satelitales</h1>
            <p className="text-sm text-tenue mt-1">Elegí qué querés ver. La imagen se procesa en el momento con datos de Copernicus.</p>
          </div>

          <fieldset className="p-3">
            <legend className="sr-only">Tipo de imagen</legend>
            {CAPAS.map((c) => {
              const activa = c.id === capaId;
              return (
                <label key={c.id} className={`block cursor-pointer px-3 py-2.5 border-l-2 ${activa ? "border-hielo bg-noche/70" : "border-transparent hover:bg-noche/40"}`}>
                  <input type="radio" name="capa" className="sr-only" checked={activa} onChange={() => elegirCapa(c)} />
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`font-medium ${activa ? "text-hielo" : ""}`}>{c.nombre}</span>
                    <span className="num text-[11px] text-tenue">{c.resolucion}</span>
                  </span>
                  <span className="block text-xs text-tenue">{c.satelite}</span>
                  {activa && <span className="block text-xs text-texto/85 mt-1.5 leading-relaxed">{c.muestra}</span>}
                </label>
              );
            })}
          </fieldset>

          <div className="px-5 py-4 border-t border-linea space-y-4 text-sm">
            <div>
              <p className="text-xs text-tenue mb-1.5">Período</p>
              <div className="flex gap-1.5 flex-wrap">
                {[2, 5, 10, 15, 30].map((d) => (
                  <button key={d} onClick={() => setDias(d)} aria-pressed={dias === d}
                    className={`px-2.5 py-1 num text-xs border ${dias === d ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>{d} d</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-tenue mb-1.5">Área</p>
              <div className="flex gap-1.5">
                <button onClick={() => setArea("cuenca")} aria-pressed={area === "cuenca"} className={`px-2.5 py-1 text-xs border ${area === "cuenca" ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>Cuenca completa</button>
                <button onClick={() => setArea("vista")} aria-pressed={area === "vista"} className={`px-2.5 py-1 text-xs border ${area === "vista" ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>Lo que veo en el mapa</button>
              </div>
              {area === "vista" && <p className="text-[11px] text-tenue mt-1.5">Acercate a una locación para ver más detalle (hasta 10 m por píxel).</p>}
            </div>
            <button onClick={generar} disabled={cargando || !listo}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-hielo text-noche font-semibold disabled:opacity-60">
              {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
              {cargando ? "Procesando imagen…" : "Generar imagen"}
            </button>
            {error && <p className="text-xs text-llama">{error}</p>}
            <label className="flex items-center gap-3 text-xs text-tenue">
              Opacidad
              <input type="range" min={0} max={1} step={0.05} value={opacidad} onChange={(e) => setOpacidad(Number(e.target.value))} className="flex-1 accent-[#8FE3F0]" />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={verFocos} onChange={(e) => setVerFocos(e.target.checked)} className="accent-[#FF8A3D]" />
              Mostrar focos térmicos de NASA FIRMS (círculos naranjas)
            </label>
          </div>
        </aside>

        <section className="relative h-[70vh] lg:h-auto lg:flex-1 order-1 lg:order-2" aria-label="Mapa con la imagen satelital elegida">
          <Globo centro={[-69, -38.25]} zoom={6.6} onListo={(m) => { mapRef.current = m; setListo(true); }} />
          <details open={leyendaAbierta} onToggle={(e) => setLeyendaAbierta((e.target as HTMLDetailsElement).open)}
            className="absolute left-4 top-4 right-4 sm:right-auto instrumento px-4 py-3 max-w-md">
            <summary className="font-medium cursor-pointer list-none flex items-start justify-between gap-3">
              <span>{info ?? capa.nombre}</span>
              <span className="text-xs text-hielo shrink-0 mt-0.5">{leyendaAbierta ? "Ocultar leyenda" : "Ver leyenda"}</span>
            </summary>
            {capa.categorias && (
              <ul className="mt-2 space-y-1">
                {capa.categorias.map((c) => (
                  <li key={c.texto} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 w-3 h-3 shrink-0 border border-white/20" style={{ background: c.color }} />
                    <span className="text-texto/90">{c.texto}</span>
                  </li>
                ))}
              </ul>
            )}
            {verFocos && (
              <p className="flex items-center gap-2 text-xs mt-2">
                <span className="w-3 h-3 shrink-0 rounded-full border-2" style={{ borderColor: "#FF8A3D" }} />
                Foco térmico detectado por NASA FIRMS (últimas 48 h)
              </p>
            )}
            {capa.leyenda && (
              <div className="mt-2">
                <div className="h-2.5 w-full" style={{ background: capa.leyenda.colores }} />
                <div className="flex justify-between num text-[11px] text-tenue mt-1"><span>{capa.leyenda.min}</span><span>{capa.leyenda.max}</span></div>
              </div>
            )}
          </details>
          {imagenUrl && (
            <a href={imagenUrl} download={`vaca-muerta-${capaId}.png`} className="absolute right-4 bottom-10 flex items-center gap-1.5 px-3 py-1.5 text-xs border border-linea bg-noche/85 text-hielo hover:border-hielo">
              <Download className="w-3.5 h-3.5" /> Descargar PNG
            </a>
          )}
          {cargando && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="instrumento px-5 py-3 flex items-center gap-3 text-sm"><Loader2 className="w-4 h-4 animate-spin text-hielo" /> Procesando {capa.nombre.toLowerCase()}…</div>
            </div>
          )}
        </section>
      </div>

      {/* Pasadas recientes (catálogo) */}
      <Catalogo />
    </div>
  );
}
