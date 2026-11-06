import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { Hotspot } from "../types";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ZoomIn, ZoomOut, Compass, Layers, Activity } from "lucide-react";

const HEATMAP_POINTS = [
  { id: "lc_1", name: "Loma Campana Pozo LCK-4", latitude: -38.252, longitude: -68.643, surface: { 2024: 1100, 2025: 2200, 2026: 3200 }, type: "Derrame de Combustible" },
  { id: "lc_2", name: "Loma Campana Pileta LCK-9", latitude: -38.235, longitude: -68.660, surface: { 2024: 800, 2025: 1400, 2026: 2300 }, type: "Lodos de Perforación" },
  { id: "lc_3", name: "Loma Campana Oleoducto L-22", latitude: -38.270, longitude: -68.620, surface: { 2024: 300, 2025: 900, 2026: 1500 }, type: "Fuga de Crudo" },
  { id: "bs_1", name: "Bandurria Sur Pad Central (YPF/Equinor)", latitude: -38.3050, longitude: -68.7180, surface: { 2024: 1500, 2025: 4100, 2026: 8400 }, type: "Derrame de Petróleo Pesado" },
  { id: "bs_2", name: "Bandurria Pozo Inyector 4", latitude: -38.2980, longitude: -68.7250, surface: { 2024: 400, 2025: 1500, 2026: 3200 }, type: "Agua de Purga / Salina" },
  { id: "bs_3", name: "Bandurria Sector de Tanques", latitude: -38.3120, longitude: -68.7100, surface: { 2024: 1200, 2025: 3500, 2026: 6200 }, type: "Infiltración Crítica de Suelos" },
  { id: "ap_1", name: "Aguada Pichana Pozo APK-1", latitude: -38.167, longitude: -69.052, surface: { 2024: 300, 2025: 900, 2026: 1500 }, type: "Quema de Gases Ineficiente" },
  { id: "ap_2", name: "Aguada Pichana Antorcha Flare-2", latitude: -38.180, longitude: -69.030, surface: { 2024: 500, 2025: 1200, 2026: 1900 }, type: "Hollín y Deposición Térmica" },
  { id: "bc_1", name: "Bajo del Choique Cabezal CHO-1", latitude: -37.915, longitude: -69.172, surface: { 2024: 100, 2025: 250, 2026: 400 }, type: "Pérdida de Presión Cruda" },
  { id: "bc_2", name: "Bajo del Choique Válvula de Alivio", latitude: -37.900, longitude: -69.190, surface: { 2024: 200, 2025: 450, 2026: 800 }, type: "Escurrimiento de Lodos" },
  { id: "eo_1", name: "El Orejano Batería Gas Central", latitude: -37.965, longitude: -69.192, surface: { 2024: 1200, 2025: 2900, 2026: 4800 }, type: "Acumulación de Aguas Pesadas" },
  { id: "eo_2", name: "El Orejano Pozo Inyector EO-3 (Arroyo Carranza)", latitude: -37.975, longitude: -69.182, surface: { 2024: 600, 2025: 1300, 2026: 2100 }, type: "Fisura de Subsuelo" },
  { id: "an_1", name: "Añelo Sector Frontera Norte", latitude: -38.300, longitude: -68.750, surface: { 2024: 400, 2025: 1100, 2026: 1950 }, type: "Depósitos No Impermeables" },
  { id: "tr_1", name: "Tratayén Hub de Distribución", latitude: -38.480, longitude: -68.600, surface: { 2024: 700, 2025: 1800, 2026: 3100 }, type: "Derrame Químico de Purga" },
  { id: "sr_1", name: "San Roque Terminal Logístico", latitude: -38.450, longitude: -68.450, surface: { 2024: 500, 2025: 1000, 2026: 1800 }, type: "Fuga en Brida de Presión" }
];

interface VacaMuertaMapProps {
  hotspots: Hotspot[];
  selectedHotspot: Hotspot | null;
  onSelectHotspot: (hotspot: Hotspot) => void;
  customIncident: {
    latitude: number;
    longitude: number;
    windDirection: string;
    windSpeed: number;
  } | null;
}

type SatelliteSensor = "RGB" | "SWIR" | "NDVI" | "TIR" | "NDWI";

export default function VacaMuertaMap({
  hotspots,
  selectedHotspot,
  onSelectHotspot,
  customIncident
}: VacaMuertaMapProps) {
  const [mapMode, setMapMode] = useState<"SVG" | "STELLITE">("STELLITE");
  const [activeSensor, setActiveSensor] = useState<SatelliteSensor>("RGB");
  const [leafletMounted, setLeafletMounted] = useState(false);
  const [heatmapYear, setHeatmapYear] = useState<number | null>(2026);

  // D3 scale for the SVG Heatmap radius representation
  const svgRadiusScale = d3.scaleSqrt()
    .domain([100, 9000])
    .range([8, 48]);

  // Leaflet references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);
  const overlaysGroupRef = useRef<L.FeatureGroup | null>(null);

  // Coordinate limits for the map GCS schema
  const latMin = -38.55;
  const latMax = -37.75;
  const lonMin = -69.25;
  const lonMax = -68.35;

  const aneloCoords = { lat: -38.352, lon: -68.789 };

  // 1. Projection function for the vector SVG map
  const project = (lat: number, lon: number) => {
    const x = 30 + ((lon - lonMin) / (lonMax - lonMin)) * 440;
    const y = 370 - ((lat - latMin) / (latMax - latMin)) * 340;
    return { x, y };
  };

  // 1b. Normalized SVG viewbox projection helper for D3 overlays
  const projectOverlay = (lat: number, lon: number) => {
    const x = ((lon - lonMin) / (lonMax - lonMin)) * 500;
    const y = 400 - ((lat - latMin) / (latMax - latMin)) * 400;
    return { x, y };
  };

  const { x: aneloX, y: aneloY } = project(aneloCoords.lat, aneloCoords.lon);

  const rp7Points = [
    { lat: -37.85, lon: -69.15 },
    { lat: -38.05, lon: -68.95 },
    { lat: -38.25, lon: -68.82 },
    aneloCoords,
    { lat: -38.45, lon: -68.62 },
    { lat: -38.54, lon: -68.48 }
  ].map(p => project(p.lat, p.lon));

  const rp17Points = [
    { lat: -38.42, lon: -69.20 },
    { lat: -38.39, lon: -69.00 },
    aneloCoords,
    { lat: -38.31, lon: -68.55 },
    { lat: -38.28, lon: -68.38 }
  ].map(p => project(p.lat, p.lon));

  const RIVER_COORDS = [
    { lat: -37.80, lon: -69.20 },
    { lat: -38.00, lon: -69.00 },
    { lat: -38.20, lon: -68.86 },
    { lat: -38.34, lon: -68.80 },
    { lat: -38.36, lon: -68.77 },
    { lat: -38.46, lon: -68.58 },
    { lat: -38.54, lon: -68.42 }
  ];

  const riverPoints = RIVER_COORDS.map(p => project(p.lat, p.lon));

  const getWindAngleAndComponents = (dir: string, speed: number) => {
    let angleRad = 0;
    switch (dir.toUpperCase()) {
      case "SW":
      case "SUDOESTE":
        angleRad = -Math.PI / 4;
        break;
      case "W":
      case "OESTE":
        angleRad = 0;
        break;
      case "NW":
      case "NOROESTE":
        angleRad = Math.PI / 4;
        break;
      case "S":
      case "SUR":
        angleRad = -Math.PI / 2;
        break;
      case "N":
      case "NORTE":
        angleRad = Math.PI / 2;
        break;
      case "E":
      case "ESTE":
        angleRad = Math.PI;
        break;
      case "NE":
      case "NORESTE":
        angleRad = 3 * Math.PI / 4;
        break;
      case "SE":
      case "SURESTE":
        angleRad = -3 * Math.PI / 4;
        break;
      default:
        angleRad = -Math.PI / 4;
    }
    return {
      angleRad,
      length: Math.min(speed * 2.2, 160)
    };
  };

  const activeIncident = selectedHotspot;
  const { x: activeX, y: activeY } = activeIncident 
    ? project(activeIncident.latitude, activeIncident.longitude) 
    : { x: 0, y: 0 };

  const windData = activeIncident 
    ? getWindAngleAndComponents(activeIncident.windDirection, activeIncident.windSpeed)
    : null;

  // 2. Leaflet Map LifeCycle Setup (runs when mapMode switches to STELLITE)
  useEffect(() => {
    if (mapMode !== "STELLITE" || !mapContainerRef.current) {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      return;
    }

    // Initialize Leaflet Map centered on Vaca Muerta (Añelo Coordinates)
    const initialLat = selectedHotspot ? selectedHotspot.latitude : aneloCoords.lat;
    const initialLng = selectedHotspot ? selectedHotspot.longitude : aneloCoords.lon;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 11,
      minZoom: 9,
      maxZoom: 16,
      zoomControl: false,
      attributionControl: false
    });

    mapRef.current = map;

    // Use High Quality Esri World Imagery (Satellite) tiles which is safe & open
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18
    }).addTo(map);

    // Feature group for markers and multispectral overlays
    const markersGroup = L.featureGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    const overlaysGroup = L.featureGroup().addTo(map);
    overlaysGroupRef.current = overlaysGroup;

    setLeafletMounted(true);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      setLeafletMounted(false);
    };
  }, [mapMode]);

  // Automatically switch to satellite mode when a hotspot is selected to see its precise location to take action
  useEffect(() => {
    if (selectedHotspot) {
      setMapMode("STELLITE");
      // Choose appropriate sensor for the selected type to enhance visual precision
      if (selectedHotspot.type === "Venteo Atmosférico") {
        setActiveSensor("SWIR");
      } else if (selectedHotspot.type === "Derrame en suelo" || selectedHotspot.type === "Acumulación de lodos") {
        setActiveSensor("NDVI");
      } else if (selectedHotspot.type === "Derrame en agua") {
        setActiveSensor("NDWI");
      } else if (selectedHotspot.type === "Anomalía Térmica") {
        setActiveSensor("TIR");
      } else {
        setActiveSensor("RGB");
      }
    }
  }, [selectedHotspot]);

  // 3. Leaflet Layer Updates (whenever selected hotspot, spots list or sensoring overlays change)
  useEffect(() => {
    const map = mapRef.current;
    const markersGroup = markersGroupRef.current;
    const overlaysGroup = overlaysGroupRef.current;

    if (!map || !markersGroup || !overlaysGroup) return;

    // Clear previous elements
    markersGroup.clearLayers();
    overlaysGroup.clearLayers();

    // Plot safe Río Neuquén trace so it's always clearly visible on the Satellite map
    const riverLatLngs = RIVER_COORDS.map(p => [p.lat, p.lon] as L.LatLngExpression);
    
    // Thick shadow/glow
    L.polyline(riverLatLngs, {
      color: "#0ea5e9",
      weight: 10,
      opacity: 0.35,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(overlaysGroup);

    // Fine stream
    const riverVector = L.polyline(riverLatLngs, {
      color: "#38bdf8",
      weight: 3.5,
      opacity: 0.85,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(overlaysGroup);

    riverVector.bindTooltip("<b>Río Neuquén</b><br/>Cuenca Hídrica de Alta Sensibilidad Ambiental", {
      sticky: true,
      className: "font-mono text-[9px] bg-slate-900 border border-sky-900 text-sky-200"
    });

    // 3a. Plot Añelo Logistical Core
    const aneloCircle = L.circleMarker([aneloCoords.lat, aneloCoords.lon], {
      radius: 9,
      color: "#f1f5f9",
      weight: 2,
      fillColor: "#ef4444",
      fillOpacity: 1
    }).addTo(markersGroup);
    
    aneloCircle.bindTooltip("<b>Centro Urbano Añelo</b><br/>Estación Base Reguladora GCS", {
      permanent: true,
      direction: "top",
      className: "font-mono text-[9px] bg-slate-900 text-slate-100 border border-slate-700/80 p-1 rounded-sm shadow-md"
    });

    // 3b. Plot HSE hotspots alerts
    hotspots.forEach(item => {
      const isSelected = selectedHotspot?.id === item.id;
      const isCritical = item.status === "Crítico";
      const color = isSelected ? "#ffffff" : isCritical ? "#ef4444" : "#f97316";

      const spotMarker = L.circleMarker([item.latitude, item.longitude], {
        radius: isSelected ? 12 : 8,
        color: color,
        weight: isSelected ? 3 : 1.5,
        fillColor: isCritical ? "#ef4444" : "#f97316",
        fillOpacity: isSelected ? 0.9 : 0.6
      }).addTo(markersGroup);

      // Onclick behavior to propagate changes back to applet state
      spotMarker.on("click", () => {
        onSelectHotspot(item);
      });

      spotMarker.bindTooltip(`<b>${item.name}</b><br/>Coords: ${item.latitude}, ${item.longitude}<br/>Estado: ${item.status}`, {
        direction: "top",
        className: "font-sans text-xs bg-slate-950 text-slate-200 border border-slate-800 p-2 rounded shadow-2xl"
      });
    });

    // 3c. Draw selected spectrograph layer overlay over satellite tiles based on active sensor
    if (selectedHotspot) {
      const lat = selectedHotspot.latitude;
      const lon = selectedHotspot.longitude;

      if (activeSensor === "SWIR") {
        // Shortwave Infrared - highlights Methane leakages with a glowing neon purple halo
        L.circle([lat, lon], {
          radius: 1200, // 1.2 Km radius
          color: "#c084fc",
          weight: 1.5,
          fillColor: "#a855f7",
          fillOpacity: 0.4
        }).addTo(overlaysGroup);

        L.circle([lat, lon], {
          radius: 500,
          color: "#ec4899",
          weight: 1,
          fillColor: "#ec4899",
          fillOpacity: 0.65
        }).addTo(overlaysGroup);
      } else if (activeSensor === "NDVI") {
        // Soil Degradation and Sludge contamination index (Brownish/dark green overlay for soil leakage)
        L.polygon([
          [lat + 0.005, lon - 0.005],
          [lat + 0.003, lon + 0.006],
          [lat - 0.004, lon + 0.004],
          [lat - 0.006, lon - 0.005]
        ], {
          color: "#10b981",
          weight: 1,
          fillColor: "#78350f",
          fillOpacity: 0.6
        }).addTo(overlaysGroup);

        L.circle([lat, lon], {
          radius: 400,
          color: "#eab308",
          weight: 1,
          fillColor: "#eab308",
          fillOpacity: 0.3
        }).addTo(overlaysGroup);
      } else if (activeSensor === "NDWI") {
        // NDWI Water Quality index - Highlights river pollution & water body boundary
        L.circle([lat, lon], {
          radius: 1200,
          color: "#0284c7",
          weight: 2,
          fillColor: "#0ea5e9",
          fillOpacity: 0.35
        }).addTo(overlaysGroup);

        L.circle([lat, lon], {
          radius: 500,
          color: "#ec4899",
          weight: 1.5,
          fillColor: "#a855f7",
          fillOpacity: 0.55
        }).addTo(overlaysGroup);
      } else if (activeSensor === "TIR") {
        // Thermal Infrared - flare heat emissions (Intense yellow & Red core)
        L.circle([lat, lon], {
          radius: 600,
          color: "#f44336",
          weight: 1.5,
          fillColor: "#ffeb3b",
          fillOpacity: 0.7
        }).addTo(overlaysGroup);

        L.circle([lat, lon], {
          radius: 200,
          color: "#ffffff",
          weight: 1,
          fillColor: "#f44336",
          fillOpacity: 0.95
        }).addTo(overlaysGroup);
      }
      
      // Wind vector visualization as a physical arrow in leaflet
      const windAngle = selectedHotspot.windDirection === "SW" || selectedHotspot.windDirection === "Sudoeste" ? 45 :
                       selectedHotspot.windDirection === "W" || selectedHotspot.windDirection === "Oeste" ? 0 : 315;
      
      // Compute end coordinates of wind vector line (~1.5 km out)
      const lengthScale = 0.015; 
      const angleRad = (windAngle * Math.PI) / 180;
      const endLat = lat + Math.sin(angleRad) * lengthScale;
      const endLon = lon + Math.cos(angleRad) * lengthScale;

      const windLine = L.polyline([[lat, lon], [endLat, endLon]], {
        color: "#38bdf8",
        weight: 3,
        dashArray: "5, 5",
        opacity: 0.8
      }).addTo(overlaysGroup);

      windLine.bindTooltip(`Vector de Viento: ${selectedHotspot.windSpeed} km/h del ${selectedHotspot.windDirection}`, {
        className: "font-mono text-[9px] bg-slate-900 text-slate-300"
      });

      // Recenter the camera smoothly to selected node
      map.setView([lat, lon], map.getZoom());
    }

    // 3d. Plot D3-driven Historical Accumulative Soils Heatmap Layer as an authentic L.svgOverlay
    if (heatmapYear !== null) {
      const svgElement = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      
      const svg = d3.select(svgElement)
        .attr("viewBox", "0 0 500 400")
        .style("pointer-events", "none");

      const defs = svg.append("defs");
      
      // Dynamic multi-tier radial flow gradient
      const grad = defs.append("radialGradient")
        .attr("id", "d3-leaflet-heat-grad")
        .attr("cx", "50%")
        .attr("cy", "50%")
        .attr("r", "50%");
      grad.append("stop").attr("offset", "0%").attr("stop-color", "#ef4444").attr("stop-opacity", "0.85");
      grad.append("stop").attr("offset", "30%").attr("stop-color", "#f97316").attr("stop-opacity", "0.55");
      grad.append("stop").attr("offset", "65%").attr("stop-color", "#eab308").attr("stop-opacity", "0.22");
      grad.append("stop").attr("offset", "90%").attr("stop-color", "#14b8a6").attr("stop-opacity", "0.06");
      grad.append("stop").attr("offset", "100%").attr("stop-color", "#14b8a6").attr("stop-opacity", "0");

      const groups = svg.selectAll("g.heat-node")
        .data(HEATMAP_POINTS)
        .enter()
        .append("g")
        .attr("class", "heat-node");

      // Outer low-density contamination halo
      groups.append("circle")
        .attr("cx", d => projectOverlay(d.latitude, d.longitude).x)
        .attr("cy", d => projectOverlay(d.latitude, d.longitude).y)
        .attr("r", d => {
          const area = d.surface[heatmapYear];
          return Math.sqrt(area) * 0.95;
        })
        .attr("fill", "url(#d3-leaflet-heat-grad)")
        .attr("opacity", 0.9);

      // Core density layer
      groups.append("circle")
        .attr("cx", d => projectOverlay(d.latitude, d.longitude).x)
        .attr("cy", d => projectOverlay(d.latitude, d.longitude).y)
        .attr("r", d => {
          const area = d.surface[heatmapYear];
          return Math.sqrt(area) * 0.35;
        })
        .attr("fill", "#ef4444")
        .attr("opacity", 0.45);

      // White pinpoints
      groups.append("circle")
        .attr("cx", d => projectOverlay(d.latitude, d.longitude).x)
        .attr("cy", d => projectOverlay(d.latitude, d.longitude).y)
        .attr("r", 2.2)
        .attr("fill", "#ffffff")
        .attr("opacity", 0.9);

      // Create Leaflet bounds & Add svg overlay to leaflet overlaysGroup
      const bounds = L.latLngBounds([latMin, lonMin], [latMax, lonMax]);
      L.svgOverlay(svgElement, bounds, {
        opacity: 0.9,
        interactive: false
      }).addTo(overlaysGroup);

      // Draw helper circles over the same coordinate centers to bind helpful HTML tooltips
      HEATMAP_POINTS.forEach(item => {
        const area = item.surface[heatmapYear];
        const helperCircle = L.circle([item.latitude, item.longitude], {
          radius: Math.sqrt(area) * 12,
          color: "transparent",
          weight: 0,
          fillColor: "transparent",
          fillOpacity: 0
        }).addTo(overlaysGroup);

        helperCircle.bindTooltip(
          `<b>${item.name}</b><br/>` +
          `Año Seleccionado: <span style="font-weight: bold; color: #f59e0b;">${heatmapYear}</span><br/>` +
          `Área Acumulación Contaminante: <b style="color: #ef4444;">${area} m²</b><br/>` +
          `<span style="font-size: 10px; color: #94a3b8;">${item.type} (Renderizado D3 Map)</span>`,
          {
            className: "font-sans text-[11px] bg-slate-950 text-slate-100 border border-slate-800 p-2.5 rounded shadow-2xl"
          }
        );
      });
    }

  }, [selectedHotspot, hotspots, activeSensor, leafletMounted, heatmapYear]);

  // Leaflet zoom helper triggers
  const handleLeafletZoomIn = () => {
    if (mapRef.current) mapRef.current.zoomIn();
  };

  const handleLeafletZoomOut = () => {
    if (mapRef.current) mapRef.current.zoomOut();
  };

  return (
    <div id="vaca-muerta-map-container" className="relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden p-5 shadow-2xl flex flex-col justify-between animate-fade-in" style={{ height: "540px" }}>
      {/* Map Header and Mode toggles */}
      <div className="flex justify-between items-start z-10 pb-3">
        <div>
          <h3 id="map-title" className="text-sm font-black text-slate-100 tracking-wider uppercase font-mono flex items-center gap-2">
            <Compass className="w-4 h-4 text-teal-400 rotate-12" />
            Vaca Muerta GIS - Teledetección Activa
          </h3>
          <p className="text-xs text-slate-400 font-mono mt-0.5">
            Soporte de satélites multiespectrales en tiempo real con zoom interactivo
          </p>
        </div>

        {/* Mode alternate selectors */}
        <div className="flex gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setMapMode("SVG")}
            className={`px-3 py-1 rounded-lg text-[10px] font-mono transition-all ${
              mapMode === "SVG"
                ? "bg-teal-500 text-slate-950 font-black"
                : "text-slate-400 hover:text-slate-200"
            }`}
            id="btn-mode-svg"
            type="button"
          >
            Esquemático
          </button>
          <button
            onClick={() => setMapMode("STELLITE")}
            className={`px-3 py-1 rounded-lg text-[10px] font-mono transition-all ${
              mapMode === "STELLITE"
                ? "bg-teal-500 text-slate-950 font-black"
                : "text-slate-400 hover:text-slate-200"
            }`}
            id="btn-mode-satellite"
            type="button"
          >
            Ver Satélite
          </button>
        </div>
      </div>

      {/* D3 Heatmap Year Selection Slider */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800/80 p-3 rounded-xl mb-3 z-10">
        <div className="flex items-center gap-2 shrink-0">
          <Activity className="w-4 h-4 text-amber-500 animate-pulse" />
          <span className="text-[11px] font-bold text-slate-200 font-mono uppercase tracking-wider">
            Historial de Contaminantes (Heatmap D3)
          </span>
        </div>

        {heatmapYear !== null ? (
          <div className="flex-1 flex items-center gap-4 px-2 min-w-0">
            <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0">2024</span>
            <input
              type="range"
              min={2024}
              max={2026}
              step={1}
              value={heatmapYear}
              onChange={(e) => setHeatmapYear(Number(e.target.value))}
              className="flex-1 accent-amber-500 h-1.5 bg-slate-950 rounded-lg appearance-none cursor-pointer border border-slate-850 focus:outline-none"
              id="heatmap-year-slider"
            />
            <span className="text-[10px] font-mono font-bold text-slate-500 shrink-0">2026</span>
            
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800/80 px-2.5 py-1 rounded-lg shrink-0">
              <span className="text-[9px] font-bold font-mono text-slate-400 uppercase">AÑO:</span>
              <span className="text-xs font-mono font-black text-amber-400 leading-none animate-pulse">
                {heatmapYear}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 text-center text-xs font-mono text-slate-500 italic">
            Capa de densidad inactiva
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setHeatmapYear(heatmapYear === null ? 2026 : null)}
            className={`w-full sm:w-auto px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer border select-none ${
              heatmapYear === null
                ? "bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400"
                : "bg-red-500/10 border-red-500/20 hover:border-red-500/40 text-red-400"
            }`}
            id="heatmap-toggle-btn"
            type="button"
          >
            {heatmapYear === null ? "ACTIVAR CAPA D3" : "APAGAR ENTORNO"}
          </button>
        </div>
      </div>

      {/* Satellite Sensor Selection Bar (Only available when in Satellite map mode) */}
      {mapMode === "STELLITE" && (
        <div className="flex items-center gap-1 bg-slate-950 border border-slate-900 p-1.5 rounded-lg mb-3 z-10 overflow-x-auto">
          <span className="text-[9px] font-bold text-slate-500 font-mono uppercase px-2">SENSOR:</span>
          {(["RGB", "SWIR", "NDVI", "NDWI", "TIR"] as SatelliteSensor[]).map((sensor) => (
            <button
              key={sensor}
              onClick={() => setActiveSensor(sensor)}
              className={`px-2.5 py-1 rounded text-[9px] font-mono uppercase font-semibold transition-all shrink-0 ${
                activeSensor === sensor
                  ? "bg-indigo-600 border border-indigo-400 text-white shadow"
                  : "bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-900"
              }`}
              id={`sensor-btn-${sensor}`}
            >
              {sensor === "RGB" && "Óptico Natural (RGB)"}
              {sensor === "SWIR" && "Atmósfera (SWIR Metano)"}
              {sensor === "NDVI" && "Suelo (NDVI Tierras)"}
              {sensor === "NDWI" && "Agua/Río (NDWI Contaminación)"}
              {sensor === "TIR" && "Temperatura (TIR Flaring)"}
            </button>
          ))}
        </div>
      )}

      {/* Main Map Box */}
      <div className="flex-1 w-full relative min-h-[240px] rounded-xl overflow-hidden border border-slate-900 bg-slate-950/80">
        
        {/* VIEW 1: Static custom SVG vector overlay */}
        {mapMode === "SVG" ? (
          <svg 
            viewBox="0 0 500 400" 
            className="w-full h-full object-contain"
            id="vm-svg-layer"
          >
            <defs>
              <radialGradient id="heatGrad" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#ef4444" stopOpacity="0.75" />
                <stop offset="35%" stopColor="#f97316" stopOpacity="0.45" />
                <stop offset="70%" stopColor="#eab308" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#eab308" stopOpacity="0" />
              </radialGradient>
            </defs>

            <g stroke="#1e293b" strokeWidth="0.5" opacity="0.4">
              <line x1="50" y1="0" x2="50" y2="400" />
              <line x1="150" y1="0" x2="150" y2="400" />
              <line x1="250" y1="0" x2="250" y2="400" />
              <line x1="350" y1="0" x2="350" y2="400" />
              <line x1="450" y1="0" x2="450" y2="400" />
            </g>

            {/* Río Neuquén stream */}
            <path
              d={`M ${riverPoints.map(p => `${p.x},${p.y}`).join(" Q ")}`}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.25"
            />
            <path
              d={`M ${riverPoints.map(p => `${p.x},${p.y}`).join(" Q ")}`}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.6"
            />

            <text x="50" y="300" fill="#38bdf8" opacity="0.6" fontSize="9" fontFamily="monospace" className="select-none font-bold">
              RÍO NEUQUÉN
            </text>

            {/* Roads */}
            <path d={`M ${rp7Points.map(p => `${p.x},${p.y}`).join(" L ")}`} fill="none" stroke="#475569" strokeWidth="1.5" opacity="0.6" />
            <path d={`M ${rp17Points.map(p => `${p.x},${p.y}`).join(" L ")}`} fill="none" stroke="#475569" strokeWidth="1.5" opacity="0.6" />

            {/* Draw Heatmap density using D3 */}
            {heatmapYear !== null && HEATMAP_POINTS.map((item) => {
              const { x, y } = project(item.latitude, item.longitude);
              const area = item.surface[heatmapYear];
              const radius = svgRadiusScale(area);
              return (
                <g key={`heat-svg-${item.id}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill="url(#heatGrad)"
                    pointerEvents="none"
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r="2.5"
                    fill="#f59e0b"
                    opacity="0.7"
                    pointerEvents="none"
                  />
                </g>
              );
            })}

            {/* Active plume Vector line */}
            {activeIncident && windData && (
              <g>
                <defs>
                  <radialGradient id="plumeGrad" cx="0%" cy="50%" r="90%">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                    <stop offset="60%" stopColor="#f97316" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#1e293b" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <path
                  d={`M ${activeX},${activeY} 
                      L ${activeX + Math.cos(windData.angleRad - 0.28) * windData.length},${activeY + Math.sin(windData.angleRad - 0.28) * windData.length} 
                      A ${windData.length * 0.3} ${windData.length * 0.3} 0 0 1 ${activeX + Math.cos(windData.angleRad + 0.28) * windData.length},${activeY + Math.sin(windData.angleRad + 0.28) * windData.length} 
                      Z`}
                  fill="url(#plumeGrad)"
                  opacity="0.8"
                />
              </g>
            )}

            {/* Core Añelo Spot */}
            <g transform={`translate(${aneloX}, ${aneloY})`}>
              <circle r="7" fill="#000" stroke="#fff" strokeWidth="2" />
              <circle r="3.5" fill="#ef4444" />
              <text y="-10" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold" fontFamily="sans-serif">AÑELO</text>
            </g>

            {/* Hotspots clickable */}
            {hotspots.map((item) => {
              const { x, y } = project(item.latitude, item.longitude);
              const isSel = selectedHotspot?.id === item.id;
              
              return (
                <g key={item.id} transform={`translate(${x}, ${y})`} className="cursor-pointer" onClick={() => onSelectHotspot(item)}>
                  <circle r={isSel ? "12" : "6"} fill="none" stroke="#f97316" strokeWidth="1.5" className="animate-ping" opacity="0.4" />
                  <circle r="5" fill={isSel ? "#38bdf8" : "#f97316"} stroke="#000" strokeWidth="1" />
                  <text y="14" textAnchor="middle" fill="#94a3b8" fontSize="8" fontFamily="monospace">{item.id.replace("_", " ")}</text>
                </g>
              );
            })}
          </svg>
        ) : (
          
          /* VIEW 2: Real Leaflet Satellite map Container with zooms and overlays */
          <div className="w-full h-full relative" id="leaflet-sat-layer-container">
            {/* Interactive Leaflet anchor element */}
            <div ref={mapContainerRef} className="w-full h-full absolute inset-0 z-0 bg-slate-950"></div>

            {/* Dedicated in-camera zoom buttons panel */}
            <div className="absolute top-3 left-3 flex flex-col gap-1 z-[12] bg-slate-900/90 border border-slate-850 p-1 rounded-xl shadow-2xl">
              <button
                onClick={handleLeafletZoomIn}
                className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-300 flex items-center justify-center transition-all"
                title="Acercar Cámara"
                type="button"
                id="btn-zoom-in-sat"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleLeafletZoomOut}
                className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-600 text-slate-300 flex items-center justify-center transition-all"
                title="Alejar Cámara"
                type="button"
                id="btn-zoom-out-sat"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>

            {/* Visual Compass Orientation Helper over satellite frame */}
            <div className="absolute bottom-3 left-3 z-[12] bg-slate-950/80 rounded px-2 py-1 border border-slate-900 text-[8px] text-slate-400 font-mono uppercase flex items-center gap-1 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
              <span>Esri World Imagery (Standard 0.5m)</span>
            </div>
          </div>
        )}

        {/* Dynamic windy summary bubble overlaid over active map */}
        {selectedHotspot && (
          <div className="absolute top-3 right-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3 font-mono text-[10px] w-40 shadow-2xl leading-tight z-[12] backdrop-blur-sm">
            <span className="text-slate-400 block mb-1">REGISTRO SENSOR WINDY:</span>
            <div className="text-slate-200 flex justify-between font-bold">
              <span>Procedencia:</span>
              <span className="text-teal-400">{selectedHotspot.windDirection}</span>
            </div>
            <div className="text-slate-200 flex justify-between font-bold mt-1">
              <span>Ráfagas:</span>
              <span className="text-sky-400">{selectedHotspot.windSpeed} km/h</span>
            </div>
            <div className="text-slate-200 flex justify-between font-bold mt-1 border-t border-slate-850 pt-1.5 text-[9px]">
              <span>Pluma arrastre:</span>
              <span className="text-indigo-400 font-bold uppercase">
                {selectedHotspot.windDirection === "SW" || selectedHotspot.windDirection === "Sudoeste" ? "NORESTE NE" : "ESTE E"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Map Footer with Scale and Legend status */}
      <div className="flex justify-between items-center bg-slate-900 border border-slate-850 p-2.5 rounded-xl text-[9px] font-mono text-slate-400 mt-3">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1.5 bg-indigo-500 rounded-sm inline-block"></span>
            Sentinel L2/CAMS Capas Activas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 bg-red-400 rounded-full inline-block animate-ping"></span>
            Foco Crítico bajo Inspección de IA
          </span>
        </div>
        <span className="text-right">Ajuste de coordenadas calibradas (GCS WGS84)</span>
      </div>
    </div>
  );
}
