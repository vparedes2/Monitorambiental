import React, { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

/** Cuenca Neuquina (Vaca Muerta) — mismo recuadro que usa la consulta a FIRMS */
export const CUENCA: [number, number][] = [
  [-70.5, -39.5], [-67.5, -39.5], [-67.5, -37.0], [-70.5, -37.0], [-70.5, -39.5]
];

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
}

/** Globo terrestre con imágenes satelitales reales (MapLibre, proyección globo) */
export default function Globo({ centro, zoom, interactivo = true, onListo, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);

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
  return (
    <div className={className ?? "absolute inset-0"}>
      <div ref={ref} className="w-full h-full" />
    </div>
  );
}

/** Agrega o actualiza una fuente GeoJSON */
export function setGeo(map: MLMap, id: string, data: GeoJSON.FeatureCollection | GeoJSON.Feature) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data as any);
  else map.addSource(id, { type: "geojson", data: data as any });
}
