import React, { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { capturarMapa, componerLamina, descargarCanvas, nombreArchivo, type ItemLeyenda } from "../lib/exportar";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/** Cuenca Neuquina (Vaca Muerta) — mismo recuadro que usa la consulta a FIRMS */
export const CUENCA: [number, number][] = [
  [-70.5, -39.5], [-67.5, -39.5], [-67.5, -37.0], [-70.5, -37.0], [-70.5, -39.5]
];

// ---------------------------------------------------------------------------
// Mapas base intercambiables. Las capas propias (focos, catastro, imágenes)
// se dibujan siempre encima, así que no se pierden al cambiar el fondo.
// ---------------------------------------------------------------------------
const ayerUtc = () => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

export interface MapaBase {
  id: string;
  nombre: string;
  detalle: string;
  tiles: () => string[];
  maxzoom: number;
  atribucion: string;
  rotulos: boolean;
}

export const MAPAS_BASE: MapaBase[] = [
  {
    id: "esri", nombre: "Satelital alta resolución", detalle: "Esri World Imagery, hasta ~0,5 m. Fecha de toma variable (meses o años).",
    tiles: () => ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
    maxzoom: 18, atribucion: "Imágenes © Esri, Maxar, Earthstar Geographics", rotulos: true
  },
  {
    id: "viirs-hoy", nombre: "Satélite de ayer (VIIRS)", detalle: "Imagen color real de NOAA-20 del día anterior, 375 m. Muestra nubes y humo actuales.",
    tiles: () => [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${ayerUtc()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`],
    maxzoom: 9, atribucion: "NASA GIBS / Worldview, VIIRS NOAA-20", rotulos: true
  },
  {
    id: "modis-hoy", nombre: "Satélite de ayer (MODIS)", detalle: "Imagen color real de Terra MODIS del día anterior, 250 m.",
    tiles: () => [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${ayerUtc()}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`],
    maxzoom: 9, atribucion: "NASA GIBS / Worldview, MODIS Terra", rotulos: true
  },
  {
    id: "noche", nombre: "Luces nocturnas (VIIRS)", detalle: "Luces de la noche anterior, 750 m. Las antorchas y equipos iluminados se ven como puntos brillantes.",
    tiles: () => [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_DayNightBand_ENCC/default/${ayerUtc()}/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png`],
    maxzoom: 8, atribucion: "NASA GIBS / Worldview, VIIRS Day/Night Band", rotulos: true
  },
  {
    id: "topo", nombre: "Topográfico", detalle: "Relieve, rutas, picadas y nombres de lugares.",
    tiles: () => ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"],
    maxzoom: 18, atribucion: "© Esri, HERE, Garmin, USGS", rotulos: false
  },
  {
    id: "calles", nombre: "Rutas y localidades", detalle: "Mapa de calles y rutas.",
    tiles: () => ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"],
    maxzoom: 18, atribucion: "© Esri, HERE, Garmin, OpenStreetMap", rotulos: false
  }
];

const BASE_LS = "mapa-base-v1";
const leerBase = () => {
  try { const v = localStorage.getItem(BASE_LS); if (v && MAPAS_BASE.some((b) => b.id === v)) return v; } catch { /* */ }
  return "esri";
};

const aplicarBase = (map: MLMap, base: MapaBase) => {
  const antes = map.getLayer("lugares") ? "lugares" : undefined;
  if (map.getLayer("satelite")) map.removeLayer("satelite");
  if (map.getSource("satelite")) map.removeSource("satelite");
  map.addSource("satelite", { type: "raster", tiles: base.tiles(), tileSize: 256, maxzoom: base.maxzoom, attribution: base.atribucion });
  map.addLayer({ id: "satelite", type: "raster", source: "satelite", paint: { "raster-saturation": base.id === "esri" ? -0.15 : 0, "raster-contrast": base.id === "esri" ? 0.08 : 0 } }, antes);
  if (map.getLayer("lugares")) map.setLayoutProperty("lugares", "visibility", base.rotulos ? "visible" : "none");
};

const ESTILO: maplibregl.StyleSpecification = {
  version: 8,
  projection: { type: "globe" },
  sky: {
    "sky-color": "#0A1628",
    "horizon-color": "#1d4a6b",
    "fog-color": "#0A1628",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.5,
    "fog-ground-blend": 0.9,
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0]
  },
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    satelite: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imágenes © Esri, Maxar, Earthstar Geographics"
    },
    lugares: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18
    }
  },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": "#0A1628" } },
    { id: "satelite", type: "raster", source: "satelite", paint: { "raster-saturation": -0.15, "raster-contrast": 0.08 } },
    { id: "lugares", type: "raster", source: "lugares", paint: { "raster-opacity": 0.75 } }
  ]
};

interface Props {
  centro: [number, number];
  zoom: number;
  interactivo?: boolean;
  onListo: (map: MLMap) => void;
  className?: string;
  /** Clases de posición del selector de mapa base */
  posicionSelector?: string;
  /** Título y leyenda de la lámina PNG exportada */
  tituloExport?: string;
  subtituloExport?: string;
  leyendaExport?: ItemLeyenda[];
}

/** Globo terrestre con imágenes satelitales reales (MapLibre, proyección globo) */
export default function Globo({ centro, zoom, interactivo = true, onListo, className, posicionSelector, tituloExport, subtituloExport, leyendaExport }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [baseId, setBaseId] = useState<string>(leerBase);
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const errores = useRef(0);

  const elegirBase = (id: string) => {
    setBaseId(id);
    setAbierto(false);
    setAviso(null);
    errores.current = 0;
    try { localStorage.setItem(BASE_LS, id); } catch { /* */ }
    const map = mapRef.current;
    const base = MAPAS_BASE.find((b) => b.id === id)!;
    if (map && cargado) {
      aplicarBase(map, base);
      if (map.getZoom() > base.maxzoom + 2) setAviso(`Esta fuente llega hasta zoom ${base.maxzoom}; alejate para verla nítida.`);
    }
  };

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: ESTILO,
      center: centro,
      zoom,
      interactive: interactivo,
      attributionControl: { compact: true },
      maxPitch: 75
    });
    mapRef.current = map;
    map.once("style.load", () => {
      const base = MAPAS_BASE.find((b) => b.id === baseId) ?? MAPAS_BASE[0];
      if (base.id !== "esri") aplicarBase(map, base);
      setCargado(true);
      map.on("error", (e: any) => {
        if (e?.sourceId === "satelite" && ++errores.current === 6) setAviso("Esta fuente no devolvió imagen para la zona o fecha. Probá otro mapa base.");
      });
      map.addSource("cuenca", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [CUENCA] } }
      });
      map.addLayer({ id: "cuenca-relleno", type: "fill", source: "cuenca", paint: { "fill-color": "#C9A46A", "fill-opacity": 0.06 } });
      map.addLayer({ id: "cuenca-borde", type: "line", source: "cuenca", paint: { "line-color": "#C9A46A", "line-width": 1.4, "line-dasharray": [3, 2] } });
      onListo(map);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El contenedor externo posiciona; MapLibre fuerza position:relative en el interno
  const actual = MAPAS_BASE.find((b) => b.id === baseId) ?? MAPAS_BASE[0];
  const exportarPng = async () => {
    const map = mapRef.current;
    if (!map) return;
    setAbierto(false);
    try {
      const snap = await capturarMapa(map);
      const c = map.getCenter();
      const lamina = componerLamina(snap, {
        titulo: tituloExport ?? "Monitor ambiental Vaca Muerta",
        subtitulo: `${subtituloExport ? subtituloExport + ". " : ""}Mapa base: ${actual.nombre}`,
        leyenda: leyendaExport,
        centro: { lat: c.lat, lon: c.lng }
      });
      descargarCanvas(lamina, nombreArchivo("mapa-vaca-muerta", "png"));
    } catch (e: any) {
      setAviso(`No se pudo exportar el mapa: ${e.message}`);
    }
  };

  const abrirExterno = (destino: "earth" | "maps") => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    const anchoPx = map.getContainer().clientWidth || 800;
    const metros = Math.max(150, Math.round(((78271.517 * Math.cos((c.lat * Math.PI) / 180)) / Math.pow(2, map.getZoom())) * anchoPx));
    const url = destino === "earth"
      ? `https://earth.google.com/web/@${c.lat.toFixed(6)},${c.lng.toFixed(6)},0a,${metros}d,35y,0h,0t,0r`
      : `https://www.google.com/maps/@${c.lat.toFixed(6)},${c.lng.toFixed(6)},${metros}m/data=!3m1!1e3`;
    window.open(url, "_blank", "noopener");
    setAbierto(false);
  };
  return (
    <div className={className ?? "absolute inset-0"}>
      <div ref={ref} className="w-full h-full" />
      {interactivo && (
        <div className={`absolute z-20 ${posicionSelector ?? "left-3 bottom-10"}`}>
          {abierto && (
            <ul className="instrumento mb-2 w-72 max-w-[calc(100vw-2rem)] py-1" role="listbox" aria-label="Mapa base">
              {MAPAS_BASE.map((b) => (
                <li key={b.id}>
                  <button role="option" aria-selected={b.id === baseId} onClick={() => elegirBase(b.id)}
                    className={`w-full text-left px-3 py-2 ${b.id === baseId ? "bg-noche/80" : "hover:bg-noche/50"}`}>
                    <span className={`block text-sm ${b.id === baseId ? "text-hielo" : ""}`}>{b.nombre}</span>
                    <span className="block text-[11px] text-tenue leading-snug">{b.detalle}</span>
                  </button>
                </li>
              ))}
              <li className="border-t border-linea mt-1 pt-1">
                <button onClick={exportarPng} className="w-full text-left px-3 py-2 hover:bg-noche/50">
                  <span className="block text-sm text-lutita">Descargar este mapa (PNG)</span>
                  <span className="block text-[11px] text-tenue leading-snug">Lámina con título, leyenda, fecha y firma.</span>
                </button>
              </li>
              <li>
                <button onClick={() => abrirExterno("earth")} className="w-full text-left px-3 py-2 hover:bg-noche/50">
                  <span className="block text-sm">Abrir esta vista en Google Earth ↗</span>
                  <span className="block text-[11px] text-tenue leading-snug">Imagen de mayor resolución y 3D, en otra pestaña.</span>
                </button>
              </li>
              <li>
                <button onClick={() => abrirExterno("maps")} className="w-full text-left px-3 py-2 hover:bg-noche/50">
                  <span className="block text-sm">Abrir en Google Maps satelital ↗</span>
                </button>
              </li>
            </ul>
          )}
          <button onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-linea bg-noche/85 text-hielo hover:border-hielo">
            <Layers className="w-3.5 h-3.5" /> Mapa base y exportar
          </button>
          {aviso && <p className="mt-1.5 max-w-xs text-[11px] text-llama bg-noche/85 px-2 py-1">{aviso}</p>}
        </div>
      )}
    </div>
  );
}

/** Agrega o actualiza una fuente GeoJSON */
export function setGeo(map: MLMap, id: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data as any);
  else map.addSource(id, { type: "geojson", data: data as any });
}
