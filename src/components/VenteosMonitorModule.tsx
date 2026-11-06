import React, { useState, useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { 
  Flame, 
  Wind, 
  AlertTriangle, 
  ShieldCheck, 
  Layers, 
  Maximize2, 
  Minimize2, 
  Building2, 
  Sparkles,
  Thermometer,
  Zap,
  ZoomIn,
  Camera,
  Eye,
  ExternalLink,
  Radio,
  Satellite,
  CheckCircle2,
  RefreshCw,
  X,
  Upload,
  FileText,
  PlusCircle,
  Check,
  AlertCircle,
  Database,
  ArrowRight,
  HelpCircle
} from "lucide-react";
import { VenteoAuditResponse, GeoJsonFeatureCollection } from "../types";
// Localidades con coordenadas reales desde OpenStreetMap (antes estaban cargadas a mano y había errores)
interface Localidad { nombre: string; lat: number; lon: number; poblacion: number | null }
const distKm = (a: number, b: number, c: number, d: number) => {
  const R = 6371, dLat = ((c - a) * Math.PI) / 180, dLon = ((d - b) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
import { 
  ejecutarCruceEspacialSatelital, 
  CruceEspacialVenteo, 
  SensorSatelital 
} from "../services/satelliteDetectionsService";
import { 
  getInstalacionesSigOficiales, 
  getGeoJsonStore,
  InstalacionSigOficial,
  normalizarCoordenadasCuenca 
} from "../services/geoportalSigService";

type BasemapType = "google-hybrid" | "google-satellite" | "esri-satellite" | "carto-dark";
type SensorFilterType = "all" | "firms" | "sentinel";
type CorrelationFilterType = "all" | "match" | "anomalia" | "critico";

// Vista satelital real (Esri World Imagery) centrada en la coordenada indicada
const imagenSatelital = (lat: number, lon: number, radioM = 600) => {
  const dLat = radioM / 111320;
  const dLon = radioM / (111320 * Math.cos((lat * Math.PI) / 180));
  const bbox = [lon - dLon * 1.6, lat - dLat, lon + dLon * 1.6, lat + dLat].join(",");
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=3857&size=800,500&format=jpg&f=image`;
};

const CATASTRO_LS_KEY = "vm_catastro_usuario_v1";
const leerCatastroLocal = (): any | null => {
  try { const t = localStorage.getItem(CATASTRO_LS_KEY); return t ? JSON.parse(t) : null; } catch { return null; }
};
const guardarCatastroLocal = (store: any) => {
  try { localStorage.setItem(CATASTRO_LS_KEY, JSON.stringify(store)); } catch { /* sin almacenamiento */ }
};

type EstadoFirmsUI = { estado: "ok" | "sin_clave" | "error"; mensaje: string; consultado_utc: string | null; total: number } | null;

// Marcador vacío para cuando todavía no hay detecciones reales
const CRUCE_VACIO: CruceEspacialVenteo = {
  id: "sin-detecciones",
  deteccion_satelital: {
    id_deteccion: "SIN-DATOS",
    sensor: "Sin detecciones",
    banda_espectral: "-",
    resolucion_espacial_m: 0,
    latitud_satelital: -38.352,
    longitud_satelital: -68.789,
    frp_mw: 0,
    temperatura_brillo_k: 0,
    temperatura_llama_c: null,
    fecha_hora_utc: "-",
    confianza_deteccion: 0,
    tasa_quema_estimada_m3d: null,
    eficiencia_combustion_est: null,
    es_venteo_frio: false
  },
  tipo_correlacion: "ANOMALIA_NO_CATASTRADA",
  match_catastral: false,
  distancia_metros_a_planta: 0,
  tolerancia_catastral_m: 0,
  etiqueta_clasificacion: "Sin detecciones",
  calificacion_posicionamiento: "",
  alerta_confusion_cargadero: false,
  estado_regulatorio: "Operativo",
  exceso_cupo_sen: false,
  porcentaje_exceso_cupo: 0,
  emisiones_estimadas: { ch4_fugitivo_ton_ano: null, co2_ton_ano: null, so2_kg_dia: null, nox_kg_dia: null },
  enlaces_inspeccion_hd: { google_maps_url: "", google_earth_url: "" }
};

const nd = (v: number | null | undefined, suf = "") =>
  v === null || v === undefined ? "N/D" : `${v.toLocaleString("es-AR")}${suf}`;

export default function VenteosMonitorModule() {
  // Live spatial join detections data and dynamic GeoJSON store
  const [cruces, setCruces] = useState<CruceEspacialVenteo[]>([]);
  const [selectedCruceState, setSelectedCruce] = useState<CruceEspacialVenteo | undefined>(undefined);
  const selectedCruce: CruceEspacialVenteo = selectedCruceState ?? CRUCE_VACIO;
  const hayDetecciones = cruces.length > 0;
  const [instalacionesSig, setInstalacionesSig] = useState<InstalacionSigOficial[]>([]);
  const [estadoFirms, setEstadoFirms] = useState<EstadoFirmsUI>(null);
  
  // Filtering & Layer state
  const [sensorFilter, setSensorFilter] = useState<SensorFilterType>("all");
  const [correlationFilter, setCorrelationFilter] = useState<CorrelationFilterType>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  
  const [showPlumes, setShowPlumes] = useState<boolean>(true);
  const [showThermalCircles, setShowThermalCircles] = useState<boolean>(true);
  const [showTownBuffers, setShowTownBuffers] = useState<boolean>(true);
  const [showCadastralTolerances, setShowCadastralTolerances] = useState<boolean>(true);
  const [showGeoportalSigLayer, setShowGeoportalSigLayer] = useState<boolean>(true);
  
  const [mapBasemap, setMapBasemap] = useState<BasemapType>("google-hybrid");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showDrawer, setShowDrawer] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  
  // GeoJSON Layer Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [geoJsonInput, setGeoJsonInput] = useState<string>("");
  const [uploadMode, setUploadMode] = useState<"merge" | "replace">("merge");
  const [uploadLoading, setUploadLoading] = useState<boolean>(false);
  const [uploadFeedback, setUploadFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  // Quick Register Modal for Uncatalogued Anomaly
  const [showRegisterModal, setShowRegisterModal] = useState<boolean>(false);
  const [newPadName, setNewPadName] = useState<string>("");
  const [newPadOperator, setNewPadOperator] = useState<string>("YPF");
  const [newPadType, setNewPadType] = useState<string>("Pad de Producción / Pozo");
  const [newPadBlock, setNewPadBlock] = useState<string>("Cuenca Neuquina");
  const [registerLoading, setRegisterLoading] = useState<boolean>(false);

  // AI Audit state
  const [auditLoading, setAuditLoading] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<VenteoAuditResponse | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.FeatureGroup | null>(null);
  const sigLayerRef = useRef<L.FeatureGroup | null>(null);
  const plumesLayerRef = useRef<L.FeatureGroup | null>(null);
  const thermalLayerRef = useRef<L.FeatureGroup | null>(null);
  const townsLayerRef = useRef<L.FeatureGroup | null>(null);
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  useEffect(() => {
    fetch("/api/localidades").then((r) => r.json()).then((d) => setLocalidades(d.localidades || [])).catch(() => {});
  }, []);
  const cadastralLayerRef = useRef<L.FeatureGroup | null>(null);
  const vectorConnectorsLayerRef = useRef<L.FeatureGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Fetch live satellite spatial join from server
  const refreshSatelital = async (forzar = false) => {
    setIsRefreshing(true);
    try {
      // Si el servidor se reinició y perdió el catastro, se re-sube la copia del navegador
      const resSig = await fetch("/api/geoportal/instalaciones");
      if (resSig.ok) {
        const sigData = await resSig.json();
        const local = leerCatastroLocal();
        if ((sigData.instalaciones?.length || 0) === 0 && local?.features?.length) {
          const r = await fetch("/api/geoportal/cargar-capa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ geojson: local, mode: "replace" })
          });
          const d = await r.json();
          if (d.instalaciones) setInstalacionesSig(d.instalaciones);
        } else if (sigData.instalaciones) {
          setInstalacionesSig(sigData.instalaciones);
        }
      }

      const resSat = await fetch(`/api/venteos/monitoreo-satelital-en-vivo${forzar ? "?forzar=1" : ""}`);
      if (resSat.ok) {
        const satData = await resSat.json();
        if (satData.estado_firms) setEstadoFirms(satData.estado_firms);
        if (satData.cruces_espaciales && Array.isArray(satData.cruces_espaciales)) {
          setCruces(satData.cruces_espaciales);
          // Keep current selection if exists
          setSelectedCruce((prev) => {
            const found = prev && satData.cruces_espaciales.find((c: CruceEspacialVenteo) => c.id === prev.id);
            return found || satData.cruces_espaciales[0];
          });
        }
      }
    } catch {
      // Sin conexión con el servidor: no se muestran datos simulados
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshSatelital();
  }, []);

  // Filtered detections
  const filteredCruces = cruces.filter((c) => {
    if (correlationFilter === "match" && !c.match_catastral) return false;
    if (correlationFilter === "anomalia" && c.match_catastral) return false;
    if (correlationFilter === "critico" && c.estado_regulatorio !== "Crítico") return false;
    
    if (sensorFilter === "firms" && !c.deteccion_satelital.sensor.includes("FIRMS")) return false;
    if (sensorFilter === "sentinel" && !c.deteccion_satelital.sensor.includes("Sentinel")) return false;

    if (operatorFilter !== "all") {
      const op = c.instalacion_sig?.operador_oficial || "";
      if (!op.toLowerCase().includes(operatorFilter.toLowerCase())) return false;
    }
    return true;
  });

  // KPI Aggregates
  const totalBurnRate = cruces.reduce((acc, c) => acc + (c.deteccion_satelital.tasa_quema_estimada_m3d ?? 0), 0);
  const totalFRP = cruces.reduce((acc, c) => acc + c.deteccion_satelital.frp_mw, 0);
  const criticalCount = cruces.filter((c) => c.estado_regulatorio === "Crítico").length;
  const directMatches = cruces.filter((c) => c.match_catastral).length;
  const anomaliasCount = cruces.filter((c) => !c.match_catastral).length;

  // Handle Upload of GeoJSON Layer
  const handleUploadGeoJson = async () => {
    if (!geoJsonInput.trim()) {
      setUploadFeedback({ type: "error", msg: "Por favor pegue un GeoJSON válido o seleccione un preset." });
      return;
    }

    setUploadLoading(true);
    setUploadFeedback(null);
    try {
      const res = await fetch("/api/geoportal/cargar-capa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geojson: geoJsonInput,
          mode: uploadMode
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Error al procesar la capa GeoJSON.");
      }

      setUploadFeedback({
        type: "success",
        msg: `${data.mensaje}`
      });

      if (data.instalaciones) setInstalacionesSig(data.instalaciones);
      if (data.geojson_store) guardarCatastroLocal(data.geojson_store);
      if (data.cruces_actualizados) {
        setCruces(data.cruces_actualizados);
        setSelectedCruce(data.cruces_actualizados[0]);
      }

      setTimeout(() => {
        setShowUploadModal(false);
        setUploadFeedback(null);
      }, 1400);

    } catch (err: any) {
      setUploadFeedback({ type: "error", msg: err.message || "Fallo en la ingesta del archivo." });
    } finally {
      setUploadLoading(false);
    }
  };

  // Reset to Base Official Layer
  const handleResetToOfficialBase = async () => {
    setUploadLoading(true);
    try {
      const res = await fetch("/api/geoportal/reset", { method: "POST" });
      const data = await res.json();
      if (data.instalaciones) setInstalacionesSig(data.instalaciones);
      if (data.geojson_store) guardarCatastroLocal(data.geojson_store);
      if (data.cruces_espaciales) {
        setCruces(data.cruces_espaciales);
        setSelectedCruce(data.cruces_espaciales[0]);
      }
      setUploadFeedback({ type: "success", msg: "Catastro vaciado. Cargue su KML o GeoJSON verificado." });
      setTimeout(() => {
        setShowUploadModal(false);
        setUploadFeedback(null);
      }, 1200);
    } catch (err: any) {
      setUploadFeedback({ type: "error", msg: err.message || "Error al reiniciar." });
    } finally {
      setUploadLoading(false);
    }
  };

  // Register Uncatalogued Anomaly as Official Pad
  const handleRegisterAnomalyAsPad = async () => {
    if (!selectedCruce) return;
    setRegisterLoading(true);
    try {
      const det = selectedCruce.deteccion_satelital;
      const res = await fetch("/api/geoportal/registrar-instalacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: newPadName.trim() || `Pad Registrado ${det.id_deteccion.split("-").slice(-2).join("-")}`,
          tipo: newPadType,
          operador: newPadOperator,
          bloque_area: newPadBlock,
          latitud: det.latitud_satelital,
          longitud: det.longitud_satelital,
          radio_tolerancia_metros: newPadType.includes("Troncal") ? 400 : newPadType.includes("Batería") ? 250 : 120,
          cupo_sen_m3d: 0
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No se pudo registrar la instalación.");
      }

      await refreshSatelital();
      setShowRegisterModal(false);
    } catch (err: any) {
      alert("Error: " + err.message);
    } finally {
      setRegisterLoading(false);
    }
  };

  // Run AI Audit for selected flare
  const handleRunAudit = async (cruce: CruceEspacialVenteo) => {
    setAuditLoading(true);
    setAuditError(null);
    try {
      const det = cruce.deteccion_satelital;
      const sig = cruce.instalacion_sig;
      const res = await fetch("/api/analyze-venteo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flareId: cruce.id,
          name: sig ? sig.nombre_oficial : det.id_deteccion,
          operator: sig ? sig.operador_oficial : "Operador Vaca Muerta",
          block: sig ? sig.bloque_concesion : "Cuenca Neuquina",
          latitude: det.latitud_satelital,
          longitude: det.longitud_satelital,
          flareType: sig ? sig.antorcha_tipo : (det.es_venteo_frio ? "Venteo Frío Directo" : "Antorcha Elevada HP"),
          burnRateM3Day: det.tasa_quema_estimada_m3d,
          combustionEfficiency: det.eficiencia_combustion_est,
          flameTempC: det.temperatura_llama_c,
          frpMW: det.frp_mw,
          sensor: det.sensor,
          fechaUtc: det.fecha_hora_utc,
          stackHeightM: sig ? sig.antorcha_altura_m : 35,
          ...(() => {
            const cerca = localidades
              .map((l) => ({ l, d: distKm(det.latitud_satelital, det.longitud_satelital, l.lat, l.lon) }))
              .sort((a, b) => a.d - b.d)[0];
            return cerca ? { nearestTown: cerca.l.nombre, nearestTownDistanceKm: Math.round(cerca.d * 10) / 10 } : {};
          })(),
          windSpeed: null,
          windDirection: null
        })
      });
      if (!res.ok) {
        throw new Error("Error en la auditoría de combustión");
      }
      const data = await res.json();
      setAuditResult(data);
    } catch (err: any) {
      console.error(err);
      setAuditError(err.message || "Error al procesar auditoría con IA");
    } finally {
      setAuditLoading(false);
    }
  };

  // Convert wind compass direction to radians and target delta
  const getWindDisplacement = (dir: string, distanceKm: number) => {
    let angleDeg = 45;
    switch (dir.toUpperCase()) {
      case "SW": angleDeg = 45; break;
      case "WSW": angleDeg = 67.5; break;
      case "W": angleDeg = 90; break;
      case "WNW": angleDeg = 112.5; break;
      case "NW": angleDeg = 135; break;
      case "S": angleDeg = 0; break;
      case "SE": angleDeg = 315; break;
      case "E": angleDeg = 270; break;
      default: angleDeg = 45;
    }
    const rad = (angleDeg * Math.PI) / 180;
    const dLat = (Math.cos(rad) * distanceKm) / 111;
    const dLon = (Math.sin(rad) * distanceKm) / 87;
    return { dLat, dLon };
  };

  // Get tile URL for basemap
  const getTileUrl = (type: BasemapType) => {
    switch (type) {
      case "google-hybrid":
        return "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
      case "google-satellite":
        return "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
      case "esri-satellite":
        return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      case "carto-dark":
        return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Centrado en el corazón de Vaca Muerta: PTC Loma Campana [-38.3580, -68.7130]
    const map = L.map(mapContainerRef.current, {
      center: [-38.3580, -68.7130],
      zoom: 11,
      minZoom: 8,
      maxZoom: 18,
      zoomControl: false
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);

    const tileLayer = L.tileLayer(getTileUrl("google-hybrid"), {
      attribution: "Google Satellite / CNES / Airbus &copy; 2026",
      maxZoom: 18
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Feature groups in layer hierarchy order
    townsLayerRef.current = L.featureGroup().addTo(map);
    sigLayerRef.current = L.featureGroup().addTo(map);
    cadastralLayerRef.current = L.featureGroup().addTo(map);
    vectorConnectorsLayerRef.current = L.featureGroup().addTo(map);
    thermalLayerRef.current = L.featureGroup().addTo(map);
    plumesLayerRef.current = L.featureGroup().addTo(map);
    markersLayerRef.current = L.featureGroup().addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Basemap Layer
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);

    const newUrl = getTileUrl(mapBasemap);
    const attribution = mapBasemap.includes("google") 
      ? "Google Satellite HD 2026" 
      : mapBasemap === "esri-satellite" 
      ? "Esri World Imagery" 
      : "CartoDB Dark";

    const newLayer = L.tileLayer(newUrl, {
      attribution,
      maxZoom: 18
    }).addTo(mapInstanceRef.current);

    newLayer.bringToBack();
    tileLayerRef.current = newLayer;
  }, [mapBasemap]);

  // Redraw layers when filters, selected cruce, or layer toggles change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // 1. Draw Towns & Residential Buffers
    if (townsLayerRef.current) {
      townsLayerRef.current.clearLayers();
      if (showTownBuffers) {
        localidades.forEach((town) => {
          L.circle([town.lat, town.lon], {
            radius: 1200,
            color: "#38bdf8",
            fillColor: "#0284c7",
            fillOpacity: 0.25,
            weight: 1.5,
            dashArray: "4, 4"
          }).addTo(townsLayerRef.current!);

          L.circle([town.lat, town.lon], {
            radius: 5000,
            color: "#0284c7",
            fillColor: "#0284c7",
            fillOpacity: 0.05,
            weight: 1,
            dashArray: "2, 4"
          }).addTo(townsLayerRef.current!);

          const townIcon = L.divIcon({
            className: "custom-town-pin",
            html: `
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950/95 border border-sky-400/50 shadow-xl backdrop-blur-md pointer-events-none transform -translate-x-1/2 -translate-y-1/2">
                <span class="w-2 h-2 rounded-full bg-sky-400"></span>
                <span class="text-[10px] font-mono font-black text-sky-200 uppercase whitespace-nowrap">${town.nombre}</span>
                ${town.poblacion ? `<span class="text-[8.5px] text-slate-400 font-mono">(${town.poblacion.toLocaleString("es-AR")} hab)</span>` : ""}
              </div>
            `,
            iconSize: [0, 0]
          });

          L.marker([town.lat, town.lon], { icon: townIcon }).addTo(townsLayerRef.current!);
        });
      }
    }

    // 2. Draw Geoportal SIG Official Facilities Layer (SEN / IDENEU Store)
    if (sigLayerRef.current) {
      sigLayerRef.current.clearLayers();
      if (showGeoportalSigLayer) {
        instalacionesSig.forEach((inst) => {
          const tipo = inst.tipo_instalacion || "";
          let iconSymbol = "🛢️";
          let badgeColor = "border-sky-500/50 text-sky-300";
          let circleColor = "#0284c7";

          if (tipo.includes("Troncal") || tipo.includes("CPF") || tipo.includes("Gas")) {
            iconSymbol = "🏭";
            badgeColor = "border-teal-500/60 text-teal-300";
            circleColor = "#14b8a6";
          } else if (tipo.includes("Batería") || tipo.includes("Bateria")) {
            iconSymbol = "🔋";
            badgeColor = "border-purple-500/60 text-purple-300";
            circleColor = "#a855f7";
          } else if (tipo.includes("Cargadero")) {
            iconSymbol = "🚚";
            badgeColor = "border-amber-500/60 text-amber-300";
            circleColor = "#f59e0b";
          } else if (tipo.includes("Compresora")) {
            iconSymbol = "⚡";
            badgeColor = "border-emerald-500/60 text-emerald-300";
            circleColor = "#10b981";
          }

          // Facility pin marker
          const sigIcon = L.divIcon({
            className: "custom-sig-pin",
            html: `
              <div class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/95 border ${badgeColor} shadow-2xl backdrop-blur-md pointer-events-auto cursor-pointer transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
                <span class="text-[10px]">${iconSymbol}</span>
                <span class="text-[8.5px] font-mono font-bold">${inst.codigo_sig}</span>
                <span class="text-[7.5px] text-slate-400 font-mono">(±${inst.radio_tolerancia_metros}m)</span>
              </div>
            `,
            iconSize: [0, 0]
          });

          // Normalizar explícitamente a [lat, lon] para Leaflet
          const { lat: instLat, lon: instLon } = normalizarCoordenadasCuenca(inst.latitud_oficial, inst.longitud_oficial);

          L.marker([instLat, instLon], { icon: sigIcon })
            .addTo(sigLayerRef.current!)
            .bindTooltip(`
              <div class="p-1 font-mono text-[10px]">
                <b class="text-teal-300">${inst.nombre_oficial}</b><br/>
                <span class="text-slate-400">Operador:</span> ${inst.operador_oficial}<br/>
                <span class="text-slate-400">Tipo:</span> ${inst.tipo_instalacion}<br/>
                <span class="text-slate-400">Tolerancia Catastral:</span> ±${inst.radio_tolerancia_metros} m
              </div>
            `);

          // Official facility tolerance footprint circle
          if (showCadastralTolerances) {
            L.circle([instLat, instLon], {
              radius: inst.radio_tolerancia_metros,
              color: circleColor,
              fillColor: circleColor,
              fillOpacity: 0.08,
              weight: 1.2,
              dashArray: "3, 3"
            }).addTo(sigLayerRef.current!);
          }
        });
      }
    }

    // 3. Draw Dotted Connector Lines ONLY for Matches within Allowable Radius
    if (vectorConnectorsLayerRef.current) {
      vectorConnectorsLayerRef.current.clearLayers();
      filteredCruces.forEach((c) => {
        // Líneas de enlace punteadas únicamente entre satélites e instalaciones que hayan hecho match espacial dentro de su radio admisible
        if (c.match_catastral && c.instalacion_sig) {
          const sig = c.instalacion_sig;
          const det = c.deteccion_satelital;
          const isSelected = selectedCruce.id === c.id;

          const { lat: satLat, lon: satLon } = normalizarCoordenadasCuenca(det.latitud_satelital, det.longitud_satelital);
          const { lat: sigLat, lon: sigLon } = normalizarCoordenadasCuenca(sig.latitud_oficial, sig.longitud_oficial);

          const polyline = L.polyline(
            [
              [satLat, satLon],
              [sigLat, sigLon]
            ],
            {
              color: isSelected ? "#2dd4bf" : "#0d9488",
              weight: isSelected ? 2.5 : 1.5,
              dashArray: "4, 5",
              opacity: isSelected ? 0.95 : 0.75
            }
          ).addTo(vectorConnectorsLayerRef.current!);

          if (c.vector_desvio) {
            polyline.bindTooltip(`
              <div class="font-mono text-[9px] text-teal-300">
                Vector instrumental: ${c.vector_desvio.distancia_m} m hacia el ${c.vector_desvio.rumbo}
              </div>
            `);
          }
        }
      });
    }

    // 4. Draw Selected Cruce Cadastral Benchmark Pin & Highlighting
    if (cadastralLayerRef.current) {
      cadastralLayerRef.current.clearLayers();
      if (selectedCruce.match_catastral && selectedCruce.instalacion_sig) {
        const sig = selectedCruce.instalacion_sig;
        const { lat: sigLat, lon: sigLon } = normalizarCoordenadasCuenca(sig.latitud_oficial, sig.longitud_oficial);

        // Highlight ring on official point
        L.circle([sigLat, sigLon], {
          radius: selectedCruce.tolerancia_catastral_m,
          color: "#14b8a6",
          dashArray: "4, 4",
          weight: 2,
          fillColor: "#14b8a6",
          fillOpacity: 0.16
        }).addTo(cadastralLayerRef.current);

        // Benchmark pin
        const refIcon = L.divIcon({
          className: "custom-cadastral-ref",
          html: `
            <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/95 border border-teal-400 shadow-2xl pointer-events-none transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              <span class="text-[9px]">📍</span>
              <span class="text-[9px] font-mono font-bold text-teal-300">
                Mensura SEN: ${sig.codigo_sig} (±${selectedCruce.tolerancia_catastral_m}m)
              </span>
            </div>
          `,
          iconSize: [0, 0]
        });

        L.marker([sigLat, sigLon], { icon: refIcon }).addTo(cadastralLayerRef.current);
      }
    }

    // 5. Draw Thermal Heat Radiative Circles (FRP in MW)
    if (thermalLayerRef.current) {
      thermalLayerRef.current.clearLayers();
      if (showThermalCircles) {
        filteredCruces.forEach((c) => {
          const det = c.deteccion_satelital;
          if (det.es_venteo_frio) return;
          const { lat: satLat, lon: satLon } = normalizarCoordenadasCuenca(det.latitud_satelital, det.longitud_satelital);
          const radiusMeters = Math.max(250, det.frp_mw * 60);
          const color = !c.match_catastral ? "#f97316" : c.estado_regulatorio === "Crítico" ? "#ef4444" : "#10b981";

          L.circle([satLat, satLon], {
            radius: radiusMeters,
            color: color,
            fillColor: color,
            fillOpacity: 0.15,
            weight: 1,
            dashArray: "2, 4"
          }).addTo(thermalLayerRef.current!);
        });
      }
    }

    // 6. Draw Wind Dispersion Plumes from Satellite Centroid
    if (plumesLayerRef.current) {
      plumesLayerRef.current.clearLayers();
      if (showPlumes) {
        filteredCruces.forEach((c) => {
          const det = c.deteccion_satelital;
          const { lat: satLat, lon: satLon } = normalizarCoordenadasCuenca(det.latitud_satelital, det.longitud_satelital);
          // Sin tasa de quema medida no se dibuja pluma (FIRMS no la provee)
          if (det.tasa_quema_estimada_m3d === null) return;
          const plumeLengthKm = (det.tasa_quema_estimada_m3d / 10000) * 1.8;
          const { dLat, dLon } = getWindDisplacement("SW", plumeLengthKm);
          const endLat = satLat + dLat;
          const endLon = satLon + dLon;

          const perpAngle = Math.atan2(dLon, dLat) + Math.PI / 2;
          const coneWidthKm = plumeLengthKm * 0.28;
          const wLat = (Math.cos(perpAngle) * coneWidthKm) / 111;
          const wLon = (Math.sin(perpAngle) * coneWidthKm) / 87;

          const conePoints: L.LatLngExpression[] = [
            [satLat, satLon],
            [endLat + wLat, endLon + wLon],
            [endLat - wLat, endLon - wLon]
          ];

          const fillColor = det.es_venteo_frio ? "#06b6d4" : !c.match_catastral ? "#f97316" : c.estado_regulatorio === "Crítico" ? "#ef4444" : "#eab308";

          L.polygon(conePoints, {
            color: fillColor,
            weight: 1,
            opacity: 0.45,
            fillColor: fillColor,
            fillOpacity: det.es_venteo_frio ? 0.35 : 0.2,
            dashArray: "2, 3"
          }).addTo(plumesLayerRef.current!);
        });
      }
    }

    // 7. Draw Satellite Detection Centroid Markers (Real Sensor Telemetry)
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();
      filteredCruces.forEach((c) => {
        const det = c.deteccion_satelital;
        const { lat: satLat, lon: satLon } = normalizarCoordenadasCuenca(det.latitud_satelital, det.longitud_satelital);
        const isSelected = selectedCruce.id === c.id;
        const isMatch = c.match_catastral;
        const isCold = det.es_venteo_frio;
        const isCrit = c.estado_regulatorio === "Crítico";

        let borderColor = isCold ? "border-cyan-400" : isCrit ? "border-red-500" : "border-emerald-400";
        let glowColor = isCold ? "rgba(6,182,212,0.8)" : isCrit ? "rgba(239,68,68,0.85)" : "rgba(16,185,129,0.7)";
        
        // Uncatalogued Anomaly distinct visual style: glowing pulsing amber/orange with warning
        if (!isMatch) {
          borderColor = "border-amber-400 animate-pulse";
          glowColor = "rgba(245,158,11,0.9)";
        }

        const facilityName = isMatch && c.instalacion_sig 
          ? c.instalacion_sig.denominacion_corta 
          : `⚠️ Anomalía [${satLat.toFixed(3)}, ${satLon.toFixed(3)}]`;

        const markerHtml = `
          <div class="relative cursor-pointer transition-all duration-300 transform -translate-x-1/2 -translate-y-1/2 ${isSelected ? "scale-125 z-50" : "hover:scale-110 z-20"}">
            ${isSelected ? `
              <div class="absolute -inset-3 rounded-full animate-ping opacity-60" style="background: ${glowColor}; animation-duration: 2s;"></div>
            ` : ""}
            <div class="w-9 h-9 rounded-xl bg-slate-950/95 border-2 ${borderColor} flex items-center justify-center shadow-[0_0_15px_${glowColor}]">
              ${!isMatch ? `
                <span class="text-amber-400 text-sm font-black animate-bounce">⚠️</span>
              ` : isCold ? `
                <span class="text-cyan-400 text-sm">💨</span>
              ` : det.sensor.includes("Sentinel") ? `
                <span class="text-emerald-400 text-sm">🛰️</span>
              ` : `
                <span class="text-amber-400 text-sm animate-pulse">🔥</span>
              `}
            </div>
            <div class="absolute top-10 left-1/2 -translate-x-1/2 bg-slate-950/95 border ${isMatch ? "border-slate-800" : "border-amber-500/60"} px-2.5 py-1 rounded-lg shadow-2xl whitespace-nowrap pointer-events-none flex items-center gap-1.5">
              <span class="w-1.5 h-1.5 rounded-full ${!isMatch ? "bg-amber-400 animate-ping" : isCold ? "bg-cyan-400" : isCrit ? "bg-red-400" : "bg-emerald-400"}"></span>
              <div>
                <span class="text-[9.5px] font-mono font-black ${isMatch ? "text-slate-100" : "text-amber-300"} block leading-tight">
                  ${facilityName}
                </span>
                <span class="text-[8px] font-mono ${isMatch ? "text-cyan-300" : "text-amber-400"}">
                  ${!isMatch ? "SIN PAD CATASTRADO" : `${c.distancia_metros_a_planta}m a planta`} · ${det.frp_mw} MW
                </span>
              </div>
            </div>
          </div>
        `;

        const flareIcon = L.divIcon({
          className: "custom-satellite-marker",
          html: markerHtml,
          iconSize: [36, 36]
        });

        // Marker siempre en [lat, lon]
        L.marker([satLat, satLon], { icon: flareIcon })
          .addTo(markersLayerRef.current!)
          .on("click", () => {
            setSelectedCruce(c);
            setShowDrawer(true);
            setAuditResult(null);
            setAuditError(null);
          });
      });
    }

  }, [filteredCruces, selectedCruce, showPlumes, showThermalCircles, showTownBuffers, showCadastralTolerances, showGeoportalSigLayer, instalacionesSig, localidades]);

  // Center on Selected Detection
  const centerOnCruce = (cruce: CruceEspacialVenteo, zoomLevel: number = 14) => {
    setSelectedCruce(cruce);
    setShowDrawer(true);
    setAuditResult(null);
    setAuditError(null);
    if (mapInstanceRef.current) {
      const { lat, lon } = normalizarCoordenadasCuenca(
        cruce.deteccion_satelital.latitud_satelital,
        cruce.deteccion_satelital.longitud_satelital
      );
      mapInstanceRef.current.flyTo(
        [lat, lon],
        zoomLevel,
        { duration: 1.2 }
      );
    }
  };

  const currentDet = selectedCruce.deteccion_satelital;
  const currentSig = selectedCruce.instalacion_sig;
  const currentImage = imagenSatelital(currentDet.latitud_satelital, currentDet.longitud_satelital);

  return (
    <div className={`transition-all duration-300 ${
      isFullscreen 
        ? "fixed inset-0 z-50 bg-slate-950 w-screen h-screen flex flex-col p-2 sm:p-4 overflow-hidden" 
        : "space-y-6"
    }`} id="modulo-exclusivo-venteos">
      
      {/* Top Header / Context Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="p-1 px-2.5 rounded bg-cyan-500/15 text-cyan-400 text-[10px] font-mono font-black tracking-wider uppercase border border-cyan-500/30 flex items-center gap-1.5">
                <Satellite className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                NASA FIRMS & SENTINEL-2 ESA · POSTGIS / GEOJSON STORE DINÁMICO
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                Res. SEN 236/93 · IDENEU Neuquén · Ley 1875
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-100 font-sans tracking-tight">
              Monitor Espacial Satelital de Venteos y Antorchas
            </h2>
            <p className="text-xs text-slate-400 max-w-3xl mt-1 leading-relaxed">
              Detección térmica continua provista por sensores espaciales (NASA FIRMS VIIRS y Copernicus Sentinel-2 SWIR) con <b>motor determinista de cruce espacial geodésico (Point-in-Buffer)</b>. Almacén vectorial dinámico en memoria: ingesta capas GeoJSON completas y clasifica automáticamente entre <b>Match Catastral</b> y <b>Anomalías No Catastradas en campo</b>.
            </p>
          </div>

          {/* Quick HUD Metrics & Layer Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 text-xs shrink-0 font-mono">
            
            {/* GeoJSON Store Management Button */}
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3.5 py-2.5 bg-gradient-to-r from-teal-500/20 via-cyan-500/20 to-sky-500/20 hover:from-teal-500/30 hover:to-cyan-500/30 border border-teal-500/50 hover:border-teal-400 text-teal-300 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-teal-500/10 transition-all cursor-pointer"
              title="Cargar capas GeoJSON oficiales o personalizadas de la Secretaría de Energía"
            >
              <Upload className="w-4 h-4 text-teal-400" />
              <span>Cargar Capa GeoJSON / SIG</span>
              <span className="bg-teal-500/30 text-teal-200 text-[9px] px-1.5 py-0.5 rounded-full font-black border border-teal-500/40">
                {instalacionesSig.length} Locaciones
              </span>
            </button>

            <div className="bg-slate-950/90 border border-teal-500/30 px-3 py-2 rounded-xl">
              <span className="text-[9px] text-teal-400 uppercase block font-sans">Matches Catastrales</span>
              <span className="text-sm font-black text-teal-300">
                {directMatches} <span className="text-[10px] text-slate-400 font-normal">/ {cruces.length}</span>
              </span>
            </div>

            <div className="bg-slate-950/90 border border-amber-500/30 px-3 py-2 rounded-xl">
              <span className="text-[9px] text-amber-400 uppercase block font-sans">Anomalías de Campo</span>
              <span className="text-sm font-black text-amber-300">
                {anomaliasCount} <span className="text-[10px] text-slate-400 font-normal">sin pad</span>
              </span>
            </div>

            <div className="bg-slate-950/90 border border-cyan-500/30 px-3 py-2 rounded-xl">
              <span className="text-[9px] text-cyan-400 uppercase block font-sans">FRP Radiación</span>
              <span className="text-sm font-black text-cyan-300">
                {totalFRP.toFixed(1)} <span className="text-[10px] text-slate-400 font-normal">MW</span>
              </span>
            </div>

            <button
              onClick={() => refreshSatelital(true)}
              disabled={isRefreshing}
              className="p-2.5 bg-slate-950 border border-slate-800 hover:border-cyan-500/50 text-cyan-300 rounded-xl transition-all cursor-pointer"
              title="Actualizar datos satelitales en vivo"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-cyan-400" : ""}`} />
            </button>

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="px-3 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-xl font-bold font-mono text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              title={isFullscreen ? "Salir de pantalla completa" : "Ver mapa a pantalla completa"}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Normal</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Completa</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Estado real de las fuentes de datos */}
        <div className={`mt-3 p-2.5 rounded-xl border text-[11px] font-mono ${
          estadoFirms?.estado === "ok" ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
          : estadoFirms?.estado === "error" ? "border-red-500/40 bg-red-500/10 text-red-300"
          : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
          <b>NASA FIRMS:</b> {estadoFirms ? estadoFirms.mensaje : "consultando…"}
          {estadoFirms?.consultado_utc && <span className="text-slate-400"> · consultado {new Date(estadoFirms.consultado_utc).toLocaleString("es-AR")}</span>}
          {" · "}<b>Catastro:</b> {instalacionesSig.length === 0
            ? "vacío — cargue su KML de Google Earth para clasificar los focos"
            : `${instalacionesSig.length} instalaciones cargadas por usted`}
          <span className="block text-slate-400 mt-0.5">FIRMS detecta llamas (antorchas, incendios). No mide caudal, eficiencia ni venteo frío: esos campos se muestran como N/D.</span>
        </div>

        {/* Filter Bar & Layer Selectors */}
        <div className="mt-4 pt-3.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Correlation Filter (Match vs Anomalia) */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-mono">
              <button
                onClick={() => setCorrelationFilter("all")}
                className={`px-2.5 py-1 rounded-lg transition-all ${correlationFilter === "all" ? "bg-slate-800 text-slate-100 font-bold" : "text-slate-400 hover:text-slate-200"}`}
              >
                Todas ({cruces.length})
              </button>
              <button
                onClick={() => setCorrelationFilter("match")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${correlationFilter === "match" ? "bg-teal-500/20 text-teal-300 font-bold border border-teal-500/30" : "text-slate-400 hover:text-teal-300"}`}
              >
                <span>✅ Matches ({directMatches})</span>
              </button>
              <button
                onClick={() => setCorrelationFilter("anomalia")}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${correlationFilter === "anomalia" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30" : "text-slate-400 hover:text-amber-300"}`}
              >
                <span>⚠️ No Catastradas ({anomaliasCount})</span>
              </button>
              <button
                onClick={() => setCorrelationFilter("critico")}
                className={`px-2.5 py-1 rounded-lg transition-all ${correlationFilter === "critico" ? "bg-red-500/20 text-red-400 font-bold border border-red-500/30" : "text-slate-400 hover:text-red-400"}`}
              >
                🔥 Críticos ({criticalCount})
              </button>
            </div>

            {/* Sensor Satelital Filter */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-mono">
              <button
                onClick={() => setSensorFilter("all")}
                className={`px-2.5 py-1 rounded-lg transition-all ${sensorFilter === "all" ? "bg-slate-800 text-slate-100 font-bold" : "text-slate-400 hover:text-slate-200"}`}
              >
                Todos Satélites
              </button>
              <button
                onClick={() => setSensorFilter("firms")}
                className={`px-2.5 py-1 rounded-lg transition-all ${sensorFilter === "firms" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30" : "text-slate-400 hover:text-amber-300"}`}
              >
                🛰️ VIIRS FIRMS
              </button>
              <button
                onClick={() => setSensorFilter("sentinel")}
                className={`px-2.5 py-1 rounded-lg transition-all ${sensorFilter === "sentinel" ? "bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30" : "text-slate-400 hover:text-cyan-300"}`}
              >
                🛰️ Sentinel-2 SWIR
              </button>
            </div>

            {/* Operator Filter */}
            <select
              value={operatorFilter}
              onChange={(e) => setOperatorFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono rounded-xl px-3 py-1.5 focus:outline-none focus:border-teal-500"
            >
              <option value="all">Todos los Operadores</option>
              <option value="YPF">YPF</option>
              <option value="Tecpetrol">Tecpetrol</option>
              <option value="TotalEnergies">TotalEnergies</option>
              <option value="Pluspetrol">Pluspetrol</option>
              <option value="Shell">Shell Argentina</option>
              <option value="TGS">TGS</option>
              <option value="Vista">Vista Energy</option>
              <option value="Pan American">Pan American Energy</option>
            </select>
          </div>

          {/* Map Layer Toggles */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <button
              onClick={() => setShowGeoportalSigLayer(!showGeoportalSigLayer)}
              className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                showGeoportalSigLayer ? "bg-teal-500/20 border-teal-500/50 text-teal-300 font-bold" : "bg-slate-950 border-slate-800 text-slate-500"
              }`}
              title="Muestra todas las instalaciones catastradas en el Geoportal SIG"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Instalaciones SIG ({instalacionesSig.length})</span>
            </button>

            <button
              onClick={() => setShowCadastralTolerances(!showCadastralTolerances)}
              className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                showCadastralTolerances ? "bg-teal-500/15 border-teal-500/40 text-teal-300 font-bold" : "bg-slate-950 border-slate-800 text-slate-500"
              }`}
              title="Muestra el buffer de tolerancia métrica (Plantas 400m, Baterías 250m, Pads 120m)"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Tolerancias (±m)</span>
            </button>

            <button
              onClick={() => setShowThermalCircles(!showThermalCircles)}
              className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                showThermalCircles ? "bg-red-500/15 border-red-500/40 text-red-300 font-bold" : "bg-slate-950 border-slate-800 text-slate-500"
              }`}
            >
              <Thermometer className="w-3.5 h-3.5" />
              <span>FRP (MW)</span>
            </button>

            <button
              onClick={() => setShowPlumes(!showPlumes)}
              className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                showPlumes ? "bg-amber-500/15 border-amber-500/40 text-amber-300 font-bold" : "bg-slate-950 border-slate-800 text-slate-500"
              }`}
            >
              <Wind className="w-3.5 h-3.5" />
              <span>Plumas</span>
            </button>

            <button
              onClick={() => setShowTownBuffers(!showTownBuffers)}
              className={`px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1.5 ${
                showTownBuffers ? "bg-sky-500/15 border-sky-500/40 text-sky-300 font-bold" : "bg-slate-950 border-slate-800 text-slate-500"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Poblaciones</span>
            </button>

            {/* Basemap Selector */}
            <select
              value={mapBasemap}
              onChange={(e) => setMapBasemap(e.target.value as BasemapType)}
              className="bg-slate-950 border border-slate-800 text-teal-400 font-bold text-xs font-mono rounded-lg px-2.5 py-1 focus:outline-none"
            >
              <option value="google-hybrid">🛰️ Google Satélite HD (Híbrido)</option>
              <option value="google-satellite">🛰️ Google Satélite Óptico</option>
              <option value="esri-satellite">🛰️ Esri World Imagery</option>
              <option value="carto-dark">🌑 Carto Dark Mode</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Expansive Map Workspace */}
      <div className={`relative bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex ${
        isFullscreen ? "flex-1 h-full min-h-0" : "h-[740px] lg:h-[780px]"
      }`}>
        
        {/* Leaflet Map Canvas */}
        <div ref={mapContainerRef} className="w-full h-full z-10" />

        {/* Floating Telemetry & Coordinates Overlay */}
        {hayDetecciones && (
        <div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-col gap-2">
          <div className="bg-slate-950/95 border border-slate-800 p-2.5 rounded-xl backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-2">
              <Satellite className="w-4 h-4 text-cyan-400 animate-spin" style={{ animationDuration: "14s" }} />
              <div>
                <span className="text-[9px] font-mono text-slate-400 block leading-tight">COORDENADA SATELITAL ACTIVA</span>
                <span className="text-[11px] font-mono font-black text-cyan-300">
                  [{currentDet.latitud_satelital.toFixed(4)}°, {currentDet.longitud_satelital.toFixed(4)}°]
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-950/95 border border-slate-800 px-3 py-1.5 rounded-xl backdrop-blur-md shadow-2xl">
            <span className="text-[9px] font-mono text-slate-400 block">SENSOR EMISOR DE DETECCIÓN</span>
            <span className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-amber-400" />
              {currentDet.sensor}
            </span>
            <span className="text-[9px] font-mono text-slate-500 block">
              Banda {currentDet.banda_espectral.split(" ")[0]} · FRP: {currentDet.frp_mw} MW
            </span>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => centerOnCruce(selectedCruce, 16)}
              className="px-3 py-1.5 bg-slate-950/95 hover:bg-slate-900 border border-teal-500/40 text-teal-300 rounded-xl text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-xl transition-all cursor-pointer"
              title="Aproximar al máximo al foco térmico satelital"
            >
              <ZoomIn className="w-3.5 h-3.5 text-teal-400" />
              <span>Zoom 16x a Foco</span>
            </button>

            <a
              href={selectedCruce.enlaces_inspeccion_hd?.google_maps_url || `https://www.google.com/maps/@${currentDet.latitud_satelital},${currentDet.longitud_satelital},18z/data=!3m1!1e3`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-slate-950/95 hover:bg-slate-900 border border-slate-700 hover:border-teal-400 text-slate-300 hover:text-teal-300 rounded-xl text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-xl transition-all"
              title="Abrir coordenadas satelitales en Google Earth / Maps"
            >
              <ExternalLink className="w-3.5 h-3.5 text-teal-400" />
              <span>Google Earth ↗</span>
            </a>
          </div>
        </div>
        )}

        {/* Floating Bottom Flare Selector Bar */}
        <div className="absolute bottom-4 left-4 right-4 lg:right-auto lg:max-w-2xl z-20 pointer-events-auto">
          <div className="bg-slate-950/95 border border-slate-800 p-2 rounded-2xl backdrop-blur-lg shadow-2xl overflow-x-auto">
            <div className="flex items-center gap-2 min-w-max">
              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase px-2 shrink-0">
                OBSERVACIONES ({filteredCruces.length}):
              </span>
              {filteredCruces.map((cruce) => {
                const isSelected = selectedCruce.id === cruce.id;
                const isMatch = cruce.match_catastral;
                const isCrit = cruce.estado_regulatorio === "Crítico";
                const label = isMatch && cruce.instalacion_sig 
                  ? cruce.instalacion_sig.denominacion_corta 
                  : `⚠️ Anomalía ${cruce.deteccion_satelital.id_deteccion.split("-").slice(-2).join("-")}`;
                
                return (
                  <button
                    key={cruce.id}
                    onClick={() => centerOnCruce(cruce, 14)}
                    className={`px-3 py-1.5 rounded-xl text-left font-mono text-xs transition-all flex items-center gap-2 shrink-0 cursor-pointer ${
                      isSelected
                        ? isMatch
                          ? "bg-teal-500/20 border border-teal-400 text-teal-200 shadow-lg"
                          : "bg-amber-500/25 border border-amber-400 text-amber-200 shadow-lg"
                        : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-850"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${!isMatch ? "bg-amber-400 animate-ping" : isCrit ? "bg-red-500 animate-ping" : "bg-emerald-400"}`} />
                    <span className="font-bold">{label.split(" ")[0]}</span>
                    <span className="text-[10px] text-slate-400 font-sans">
                      ({isMatch && cruce.instalacion_sig ? cruce.instalacion_sig.bloque_concesion.split(" ")[0] : "Campo"})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Telemetry Detail Drawer for the Selected Cruce (Floating right) */}
        {showDrawer && hayDetecciones && (
          <div className="absolute top-4 right-4 bottom-4 w-full sm:w-[440px] z-30 pointer-events-auto flex flex-col bg-slate-950/95 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-xl overflow-hidden animate-fade-in">
            
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-950 flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded ${
                    selectedCruce.match_catastral
                      ? "text-teal-400 bg-teal-500/15 border border-teal-500/30"
                      : "text-amber-400 bg-amber-500/20 border border-amber-500/40"
                  }`}>
                    {selectedCruce.match_catastral ? "MATCH CATASTRAL DIRECTO" : "ANOMALÍA EN CAMPO (SIN PAD)"}
                  </span>
                  <span className="text-[9.5px] font-mono text-cyan-400">
                    {currentDet.sensor.split(" (")[0]}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-100 font-sans tracking-tight">
                  {currentSig ? currentSig.nombre_oficial : `Anomalía Térmica ${currentDet.id_deteccion}`}
                </h3>
                <p className="text-xs text-teal-400 font-mono mt-0.5">
                  Operador: {currentSig ? currentSig.operador_oficial : "Área no catastrada"}
                </p>
              </div>

              <button
                onClick={() => setShowDrawer(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title="Cerrar panel lateral"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Telemetry Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-sans">
              
              {/* High-Resolution Aerial / Optical Photograph of the Plant or Area */}
              <div className="relative h-44 rounded-xl overflow-hidden border border-slate-800 shadow-xl group bg-slate-900">
                <img 
                  src={currentImage}
                  alt={currentSig?.nombre_oficial || "Foco Satelital"}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
                
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/85 border border-teal-500/30 text-[9px] font-mono font-bold text-teal-300 backdrop-blur-md">
                  <Camera className="w-3 h-3 text-teal-400" />
                  <span>{selectedCruce.match_catastral ? "INSPECCIÓN VISUAL DE PLANTA" : "VISTA SATELITAL DEL POLÍGONO"}</span>
                </div>

                <button
                  onClick={() => centerOnCruce(selectedCruce, 16)}
                  className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/85 border border-slate-700 hover:border-teal-400 text-[9px] font-mono font-bold text-slate-200 backdrop-blur-md transition-all cursor-pointer"
                  title="Ver en satélite con zoom 16x"
                >
                  <Eye className="w-3 h-3 text-teal-400" />
                  <span>Zoom Satelital</span>
                </button>

                <div className="absolute bottom-2.5 left-2.5 right-2.5">
                  <span className="text-[10.5px] font-mono text-slate-200 font-bold block leading-tight">
                    {currentSig?.tipo_instalacion || "Área de Exploración / Explotación No Catastrada"}
                  </span>
                  <div className="flex items-center gap-2 mt-1 text-[9px] font-mono text-slate-400">
                    <span>Bloque: {currentSig?.bloque_concesion || "Cuenca Neuquina"}</span>
                    <span>·</span>
                    <span>FRP: {currentDet.frp_mw} MW</span>
                  </div>
                </div>
              </div>

              {/* Cruce Espacial Automático (Spatial Join) con el Geoportal SIG Oficial */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                selectedCruce.match_catastral
                  ? "bg-slate-900/90 border-teal-500/40" 
                  : "bg-amber-950/30 border-amber-500/50"
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold">
                    <ShieldCheck className={`w-3.5 h-3.5 ${selectedCruce.match_catastral ? "text-teal-400" : "text-amber-400"}`} />
                    <span className={selectedCruce.match_catastral ? "text-teal-300 uppercase" : "text-amber-300 uppercase"}>
                      CRUCE ESPACIAL GEOPORTAL SIG
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-black ${
                    selectedCruce.match_catastral
                      ? "bg-teal-500/20 text-teal-300 border border-teal-500/40" 
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}>
                    {selectedCruce.match_catastral ? "MATCH ASOCIADO" : "ANOMALÍA INDEPENDIENTE"}
                  </span>
                </div>

                <p className={`text-xs leading-snug font-sans ${
                  selectedCruce.match_catastral ? "text-slate-300" : "text-amber-200 font-medium"
                }`}>
                  {selectedCruce.calificacion_posicionamiento}
                </p>

                {/* Instrumental offset vector detail for matches */}
                {selectedCruce.vector_desvio && (
                  <div className="mt-2.5 p-2 bg-slate-950/80 rounded-lg border border-teal-500/20 text-[10px] font-mono text-teal-300 flex items-start gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-teal-400 shrink-0 mt-0.5" />
                    <span>{selectedCruce.vector_desvio.descripcion}</span>
                  </div>
                )}

                {/* Uncatalogued anomaly actions & distance */}
                {!selectedCruce.match_catastral && (
                  <div className="mt-3 pt-2.5 border-t border-amber-500/30 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-300">
                      <span>Distancia a instalación más cercana:</span>
                      <span className="font-bold text-amber-400">{(selectedCruce.distancia_metros_a_planta / 1000).toFixed(1)} km</span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <a
                        href={selectedCruce.enlaces_inspeccion_hd?.google_maps_url || `https://www.google.com/maps/@${currentDet.latitud_satelital},${currentDet.longitud_satelital},18z/data=!3m1!1e3`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-1.5 px-2 bg-slate-900 hover:bg-slate-850 border border-amber-500/40 text-amber-300 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 shadow"
                      >
                        <ExternalLink className="w-3 h-3 text-amber-400" />
                        <span>Abrir en Google Earth HD ↗</span>
                      </a>

                      <button
                        onClick={() => {
                          setNewPadName(`Pad Pozo ${currentDet.id_deteccion.split("-").slice(-2).join("-")}`);
                          setShowRegisterModal(true);
                        }}
                        className="py-1.5 px-2 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-300 rounded-lg text-[10px] font-mono font-bold flex items-center justify-center gap-1.5 shadow cursor-pointer"
                      >
                        <PlusCircle className="w-3 h-3 text-teal-400" />
                        <span>Registrar como Pad</span>
                      </button>
                    </div>
                  </div>
                )}

                {currentSig && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-[9.5px] font-mono">
                    <div>
                      <span className="text-slate-500 block">Coord. Satélite:</span>
                      <span className="text-cyan-300 font-bold">
                        [{currentDet.latitud_satelital.toFixed(4)}°, {currentDet.longitud_satelital.toFixed(4)}°]
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Coord. Catastro SEN:</span>
                      <span className="text-slate-200 font-bold">
                        [{currentSig.latitud_oficial.toFixed(4)}°, {currentSig.longitud_oficial.toFixed(4)}°]
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Distancia Satélite ↔ Planta:</span>
                      <span className="font-bold text-emerald-400">
                        {selectedCruce.distancia_metros_a_planta} metros
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Radio Tolerancia Oficial:</span>
                      <span className="text-teal-400 font-bold">
                        ±{selectedCruce.tolerancia_catastral_m} metros
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Critical Alert Warning if Flaring Exceeds Quota */}
              {selectedCruce.exceso_cupo_sen && (
                <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-red-200 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-red-400 mb-1 font-mono uppercase text-[10px]">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                    Exceso de Venteo sobre Cupo SEN
                  </div>
                  <p className="leading-snug text-[11.5px]">
                    Quema estimada de <b>{nd(currentDet.tasa_quema_estimada_m3d)} m³/día</b> excede el cupo cargado ({nd(currentSig?.cupo_sen_m3d)} m³/día) en un <b>+{selectedCruce.porcentaje_exceso_cupo}%</b>.
                  </p>
                </div>
              )}

              {/* Special Cold Venting Alert */}
              {currentDet.es_venteo_frio && (
                <div className="p-3 bg-cyan-950/60 border border-cyan-500/40 rounded-xl text-cyan-200 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-cyan-400 mb-1 font-mono uppercase text-[10px]">
                    <Zap className="w-3.5 h-3.5 text-cyan-400" />
                    Venteo Frío No Combustionado
                  </div>
                  <p className="leading-snug text-[11.5px]">
                    Escape directo de metano a la atmósfera sin llama. El poder de calentamiento global del metano libre es 28× superior al CO₂. Infracción directa a la Ley 1875.
                  </p>
                </div>
              )}

              {/* Grid Metrics */}
              <div className="grid grid-cols-2 gap-2.5 font-mono">
                <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
                  <span className="text-[9px] text-slate-400 uppercase block">Tasa Quema Estimada</span>
                  <span className="text-sm font-black text-amber-400">
                    {nd(currentDet.tasa_quema_estimada_m3d)} <span className="text-[9px] text-slate-400">m³/d</span>
                  </span>
                  <span className="text-[8.5px] text-slate-500 block mt-0.5">{currentDet.tasa_quema_estimada_m3d === null ? "FIRMS no mide caudal" : `Cupo: ${currentSig?.cupo_sen_m3d ? currentSig.cupo_sen_m3d.toLocaleString("es-AR") : "sin dato"}`}</span>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
                  <span className="text-[9px] text-slate-400 uppercase block">Eficiencia Combustión</span>
                  <span className={`text-sm font-black ${currentDet.eficiencia_combustion_est !== null && currentDet.eficiencia_combustion_est < 90 ? "text-red-400" : "text-slate-200"}`}>
                    {nd(currentDet.eficiencia_combustion_est, "%")}
                  </span>
                  <span className="text-[8.5px] text-slate-500 block mt-0.5">Exigible: 98.0%</span>
                </div>

                <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-xl">
                  <span className="text-[9px] text-slate-400 uppercase block">Temp. Llama / Brillo</span>
                  <span className="text-sm font-black text-slate-200">
                    {nd(currentDet.temperatura_llama_c, "°C")}
                  </span>
                  <span className="text-[8.5px] text-slate-500 block mt-0.5">Brillo: {currentDet.temperatura_brillo_k} K</span>
                </div>

                <div className="bg-slate-900/80 border border-cyan-500/30 p-2.5 rounded-xl">
                  <span className="text-[9px] text-cyan-400 uppercase block">Potencia Radiativa (FRP)</span>
                  <span className="text-sm font-black text-cyan-300">
                    {currentDet.frp_mw} MW
                  </span>
                  <span className="text-[8.5px] text-slate-500 block mt-0.5">Medición Radiómetro</span>
                </div>
              </div>

              {/* Satellite Telemetry Details */}
              <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl space-y-2 text-[11px]">
                <div className="flex justify-between items-center pb-1.5 border-b border-slate-850">
                  <span className="text-slate-400 font-mono">Sensor Satelital:</span>
                  <span className="font-bold text-cyan-300 text-right">{currentDet.sensor}</span>
                </div>

                <div className="flex justify-between items-center pb-1.5 border-b border-slate-850">
                  <span className="text-slate-400 font-mono">Banda Espectral:</span>
                  <span className="font-bold text-slate-200">{currentDet.banda_espectral}</span>
                </div>

                <div className="flex justify-between items-center pb-1.5 border-b border-slate-850">
                  <span className="text-slate-400 font-mono">Resolución Espacial:</span>
                  <span className="font-bold text-slate-200 font-mono">{currentDet.resolucion_espacial_m} metros / píxel</span>
                </div>

                <div className="flex justify-between items-center pb-1.5 border-b border-slate-850">
                  <span className="text-slate-400 font-mono">Fecha / Hora UTC:</span>
                  <span className="font-bold text-amber-300 font-mono">{currentDet.fecha_hora_utc}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-mono">Confianza Detección:</span>
                  <span className="text-emerald-400 font-mono font-bold">{currentDet.confianza_deteccion}%</span>
                </div>
              </div>

              {/* AI Expert Audit Button */}
              <button
                onClick={() => handleRunAudit(selectedCruce)}
                disabled={auditLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black font-mono text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {auditLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>AUDITANDO TELEMETRÍA Y LEY 1875 CON IA...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>AUDITAR TELEMETRÍA SATELITAL CON IA</span>
                  </>
                )}
              </button>

              {/* AI Audit Result Card */}
              {auditError && (
                <div className="p-3 bg-red-950/50 border border-red-500/30 rounded-xl text-red-300 text-xs">
                  {auditError}
                </div>
              )}

              {auditResult && (
                <div className="p-4 bg-slate-900 border border-teal-500/40 rounded-xl space-y-3 animate-fade-in shadow-xl">
                  <div className="flex justify-between items-start border-b border-slate-800 pb-2">
                    <div>
                      <span className="text-[9px] font-mono text-teal-400 font-bold uppercase tracking-wider block">DICTAMEN REGULATORIO</span>
                      <h4 className="text-xs font-black text-slate-100 mt-0.5">{auditResult.calificacion_legal}</h4>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-black ${
                      auditResult.es_infraccion_grave ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                    }`}>
                      Score {auditResult.score_infraccion}/100
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed font-sans">
                    {auditResult.diagnostico_termodinamico || (auditResult as any).fundamento_tecnico}
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                    <div>
                      <span className="text-slate-500 block">CH₄ Fugitivo Estimado:</span>
                      <span className="text-red-400 font-bold">{auditResult.emisiones_estimadas?.ch4_fugitivo_ton_ano?.toLocaleString("es-AR")} ton/año</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">CO₂ Combustión:</span>
                      <span className="text-slate-200 font-bold">{auditResult.emisiones_estimadas?.co2_ton_ano?.toLocaleString("es-AR")} ton/año</span>
                    </div>
                  </div>

                  <div className="text-[10px] space-y-1">
                    <span className="text-slate-400 font-mono block">Plan de Mitigación Exigido:</span>
                    <ul className="list-disc pl-4 text-slate-300 space-y-1">
                      {(auditResult.medidas_ingenieriles_mitigacion || (auditResult as any).medidas_mitigacion || []).slice(0, 3).map((m: string, idx: number) => (
                        <li key={idx}>{m}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Carga y Sincronización de Capas Catastrales (GeoJSON Store) */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20 text-teal-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-100 font-sans tracking-tight">
                    Cargar y Sincronizar Capa Catastral SIG (GeoJSON)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Almacén unificado en memoria · Cruce espacial determinista recalculado al instante
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs font-sans">
              
              {/* Cómo armar el catastro */}
              <div className="p-3 bg-slate-950/70 border border-teal-500/30 rounded-xl text-[11px] text-slate-300 space-y-1.5">
                <span className="text-[10px] font-mono font-bold text-teal-300 uppercase tracking-wider block">
                  1. Armar el catastro en Google Earth (coordenadas reales)
                </span>
                <p>a) Ponga un marcador sobre cada planta, batería, pad o cargadero. En el nombre incluya el tipo: <b>PTC</b>, <b>CPF</b>, <b>Planta</b>, <b>Batería</b>, <b>Compresora</b>, <b>Cargadero</b>, <b>EPF</b> o <b>Pad</b> (define la tolerancia: 400 / 250 / 200 / 120 m).</p>
                <p>b) Agrúpelos en una carpeta, clic derecho → <b>Guardar lugar como… → KML</b> (no KMZ).</p>
                <p>c) Suba ese .kml acá abajo. Queda guardado en el servidor y en este navegador.</p>
              </div>

              {/* GeoJSON Input Area */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                    2. O pegar contenido KML o GeoJSON:
                  </span>
                  <label className="text-[10px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    <span>Cargar archivo .kml / .geojson</span>
                    <input
                      type="file"
                      accept=".geojson,.json,.kml"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            setGeoJsonInput(event.target?.result as string);
                          };
                          reader.readAsText(file);
                        }
                      }}
                    />
                  </label>
                </div>

                <textarea
                  value={geoJsonInput}
                  onChange={(e) => setGeoJsonInput(e.target.value)}
                  placeholder={`{\n  "type": "FeatureCollection",\n  "features": [\n    {\n      "type": "Feature",\n      "geometry": { "type": "Point", "coordinates": [-68.9140, -37.6420] },\n      "properties": {\n        "nombre": "Pad Rincón del Mangrullo",\n        "tipo": "Pad de Producción / Pozo",\n        "operador": "YPF"\n      }\n    }\n  ]\n}`}
                  rows={8}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 font-mono text-[11px] text-slate-200 focus:outline-none focus:border-teal-500 resize-none"
                />
              </div>

              {/* Ingestion Mode Selector & Tolerance Rules Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-[11px]">
                <div>
                  <span className="font-mono text-slate-400 block mb-1 font-bold">Modo de Ingestión:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadMode("merge")}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[10px] font-bold border transition-all ${
                        uploadMode === "merge" ? "bg-teal-500/20 border-teal-500 text-teal-300" : "border-slate-800 text-slate-400"
                      }`}
                    >
                      Combinar (Merge)
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode("replace")}
                      className={`flex-1 py-1.5 px-2 rounded-lg font-mono text-[10px] font-bold border transition-all ${
                        uploadMode === "replace" ? "bg-amber-500/20 border-amber-500 text-amber-300" : "border-slate-800 text-slate-400"
                      }`}
                    >
                      Reemplazar Todo
                    </button>
                  </div>
                </div>

                <div className="text-[10px] font-mono text-slate-400 space-y-0.5">
                  <span className="font-bold text-slate-300 block">Tolerancias automáticas:</span>
                  <div>🏭 Troncales / PTC / Gas: <b>±400 m</b></div>
                  <div>🔋 Baterías y Colectoras: <b>±250 m</b></div>
                  <div>🛢️ Pads y Pozos: <b>±120 m</b></div>
                </div>
              </div>

              {/* Feedback Alert */}
              {uploadFeedback && (
                <div className={`p-3 rounded-xl text-xs font-mono flex items-center gap-2 ${
                  uploadFeedback.type === "success" 
                    ? "bg-emerald-950/60 border border-emerald-500/40 text-emerald-300" 
                    : "bg-red-950/60 border border-red-500/40 text-red-300"
                }`}>
                  {uploadFeedback.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{uploadFeedback.msg}</span>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/50 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={handleResetToOfficialBase}
                disabled={uploadLoading}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs font-mono rounded-xl transition-all cursor-pointer"
              >
                Vaciar catastro
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 text-xs font-mono rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleUploadGeoJson}
                  disabled={uploadLoading}
                  className="px-5 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs font-mono rounded-xl transition-all shadow-lg shadow-teal-500/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {uploadLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>PROCESANDO CAPA...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>INGESTAR Y RECALCULAR CRUCES</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* MODAL 2: Registrar Anomalía No Catastrada como Nuevo Pad */}
      {showRegisterModal && hayDetecciones && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            
            <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <div className="flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-black text-slate-100 font-sans">
                  Registrar Foco en Catastro Oficial
                </h3>
              </div>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs font-sans">
              <p className="text-slate-400 leading-relaxed">
                Esta acción creará una nueva entidad catastral en la coordenada exacta transmitida por el satélite, vinculando el foco térmico como un <b>Match Catastral</b> con su tolerancia correspondiente.
              </p>

              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">Nombre Oficial de la Instalación</label>
                <input
                  type="text"
                  value={newPadName}
                  onChange={(e) => setNewPadName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">Operador</label>
                  <select
                    value={newPadOperator}
                    onChange={(e) => setNewPadOperator(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 font-mono text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="YPF">YPF</option>
                    <option value="Tecpetrol">Tecpetrol</option>
                    <option value="Pan American Energy">Pan American Energy</option>
                    <option value="Pluspetrol">Pluspetrol</option>
                    <option value="Shell Argentina">Shell Argentina</option>
                    <option value="TotalEnergies">TotalEnergies</option>
                    <option value="Vista Energy">Vista Energy</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">Tipo de Instalación</label>
                  <select
                    value={newPadType}
                    onChange={(e) => setNewPadType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 font-mono text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="Pad de Producción / Pozo">Pad de Producción (±120m)</option>
                    <option value="Batería Colectora">Batería Colectora (±250m)</option>
                    <option value="Planta Troncal / PTC / Gas">Planta Troncal / PTC (±400m)</option>
                    <option value="Cargadero">Cargadero (±200m)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-slate-400 uppercase block mb-1">Bloque / Área de Concesión</label>
                <input
                  type="text"
                  value={newPadBlock}
                  onChange={(e) => setNewPadBlock(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-xs text-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-850 font-mono text-[10px] text-slate-400">
                Coordenadas WGS84: <span className="text-teal-400 font-bold">[{currentDet.latitud_satelital.toFixed(4)}, {currentDet.longitud_satelital.toFixed(4)}]</span>
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRegisterModal(false)}
                className="px-3 py-1.5 bg-slate-900 border border-slate-800 text-slate-300 text-xs font-mono rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleRegisterAnomalyAsPad}
                disabled={registerLoading}
                className="px-4 py-1.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-xs font-mono rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
              >
                {registerLoading ? "REGISTRANDO..." : "CONFIRMAR ALTA EN CATASTRO"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
