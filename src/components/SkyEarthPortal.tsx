import React, { useState } from "react";
import { Hotspot } from "../types";
import { 
  Globe2, 
  MapPin, 
  ExternalLink, 
  Layers, 
  Camera, 
  TrendingUp, 
  Info, 
  ShieldAlert, 
  MousePointer2, 
  Activity,
  Cpu
} from "lucide-react";

interface SkyEarthPortalProps {
  selectedHotspot: Hotspot | null;
}

export default function SkyEarthPortal({ selectedHotspot }: SkyEarthPortalProps) {
  const [activeBand, setActiveBand] = useState<"natural" | "infrared" | "radar">("natural");
  
  if (!selectedHotspot) {
    return (
      <div className="p-6 bg-slate-950/40 rounded-xl border border-slate-850 text-center text-xs text-slate-400 font-sans">
        Selecciona un yacimiento activo para habilitar las pasarelas GIS de SkyTruth y Google Earth.
      </div>
    );
  }

  const { latitude, longitude, name, locationName, surfaceArea, status } = selectedHotspot;

  // SkyTruth monitoring links
  const skytruthAlertsUrl = "https://alerts.skytruth.org/";
  // Google Earth 3D dynamic perspective zoom URL
  const googleEarthUrl = `https://earth.google.com/web/@${latitude},${longitude},1405a,2000d,35y,0h,0t,0r`;
  // Google Maps Satellite 2D precise high resolution coordinate URL
  const googleMapsUrl = `https://www.google.com/maps/@${latitude},${longitude},15.5z/data=!3m1!1e3`;

  return (
    <div className="bg-slate-900/40 border border-slate-805 rounded-2xl p-6 shadow-xl relative overflow-hidden" id="skyearth-portal-widget-root">
      {/* Dynamic atmospheric decoration */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-gradient-to-tr from-cyan-550/5 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 border border-emerald-500/20 rounded-xl">
            <Globe2 className="w-5.5 h-5.5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded">
                Pasarela gis complementaria
              </span>
              <span className="text-[10.5px] font-mono text-slate-400 flex items-center gap-1">
                • SkyTruth Alerts & Earth Engine Bridges
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 font-sans mt-1">
              Portal de Observación de Zonas Comprometidas
            </h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Coordinates & Real-Time Open Access Links */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-950 p-4 border border-slate-850 rounded-xl space-y-3.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 font-sans flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-emerald-400" />
                Ubicación del Incidente:
              </span>
              <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded ${
                status === "Crítico" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
              }`}>
                {status.toUpperCase()}
              </span>
            </div>

            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-805 space-y-1 text-xs">
              <p className="font-bold text-slate-200 leading-tight">{name}</p>
              <p className="text-slate-450 text-[11px] font-mono">{locationName}</p>
              <div className="pt-2 flex justify-between text-[11px] font-mono text-emerald-400">
                <span>Lat: {latitude.toFixed(4)}°</span>
                <span>Lng: {longitude.toFixed(4)}°</span>
              </div>
            </div>

            {/* Practical instructions warning */}
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Los puentes directos abajo recalculan el centroide orbital para cargar la ubicación exacta en el satélite comercial tridimensional. Esto permite ver caminos de fractura, piletones ilegales y desmontes forestales en tiempo real.
            </p>
          </div>

          {/* Core Interactive Bridges */}
          <div className="space-y-2.5">
            <span className="text-[10.5px] font-mono text-slate-400 block uppercase px-1">
              Disparadores de Inspección Externa:
            </span>
            <div className="grid grid-cols-1 gap-2">
              <a 
                href={googleEarthUrl} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center justify-between p-3 bg-gradient-to-r from-emerald-500/10 to-teal-500/5 hover:from-emerald-500/20 hover:to-teal-500/10 border border-emerald-550/25 rounded-xl transition-colors group cursor-pointer"
                id="earth-launcher-link"
              >
                <div className="flex items-center gap-2.5 text-xs font-bold text-slate-205 font-sans">
                  <span className="p-1 px-1.5 bg-emerald-500/15 text-emerald-400 rounded font-mono text-[9px]">EARTH</span>
                  Explorar en Google Earth 3D
                </div>
                <ExternalLink className="w-4 h-4 text-emerald-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>

              <a 
                href={skytruthAlertsUrl} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center justify-between p-3 bg-gradient-to-r from-sky-500/10 to-sky-500/5 hover:from-sky-500/20 hover:to-sky-500/10 border border-sky-500/25 rounded-xl transition-colors group cursor-pointer"
                id="skytruth-launcher-link"
              >
                <div className="flex items-center gap-2.5 text-xs font-bold text-slate-205 font-sans">
                  <span className="p-1 px-1.5 bg-sky-500/15 text-sky-400 rounded font-mono text-[9px]">ALERT</span>
                  Buscar registros en SkyTruth alerts
                </div>
                <ExternalLink className="w-4 h-4 text-sky-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>

              <a 
                href={googleMapsUrl} 
                target="_blank" 
                rel="noreferrer"
                className="flex items-center justify-between p-3 bg-slate-950 hover:bg-slate-900 border border-slate-850 rounded-xl transition-colors group cursor-pointer"
                id="maps-launcher-link"
              >
                <div className="flex items-center gap-2.5 text-xs text-slate-300 font-sans">
                  <span className="p-1 px-1.5 bg-slate-800 text-slate-400 rounded font-mono text-[9px]">SATELLITE</span>
                  Abrir Mapa Satelital Directo (Google Maps)
                </div>
                <ExternalLink className="w-4 h-4 text-slate-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>
          </div>
        </div>

        {/* Right Column: Dynamic Simulated GIS Spectral Viewer (SkyTruth simulator) */}
        <div className="lg:col-span-7 bg-slate-950/40 border border-slate-855 rounded-xl p-5 flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-3">
            <div>
              <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded">
                Simulador de banda espectral esap-c
              </span>
              <p className="text-[11.5px] text-slate-350 mt-2 leading-relaxed">
                Intercambie los lentes reflectivos para visualizar anomalías térmicas y saturación de derrames químicos en el suelo según el modelo multiespectral de SkyTruth:
              </p>
            </div>
          </div>

          {/* Interactive view screen */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 h-[210px] relative overflow-hidden flex items-center justify-center my-3 shadow-inner">
            {/* Real Earth Satellite Topography desert soil image */}
            <img 
              src="https://images.unsplash.com/photo-1524661135-423995f22d0b?w=600&auto=format&fit=crop&q=80" 
              alt="Vista satelital de Vaca Muerta" 
              referrerPolicy="no-referrer"
              className={`absolute inset-0 w-full h-full object-cover transition-colors duration-1000 ${
                activeBand === "natural" 
                  ? "brightness-110 contrast-105 saturate-100" 
                  : activeBand === "infrared" 
                  ? "brightness-75 contrast-175 saturate-200 hue-rotate-[290deg]" 
                  : "brightness-90 contrast-200 grayscale saturate-0 hue-rotate-[180deg] invert"
              }`}
              id="satellite-earth-underlay"
            />

            {/* Subtle radar coordinate grids overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(16,185,129,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(16,185,129,0.06)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

            {/* Simulated crosshair viewfinder */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-10 h-10 border border-teal-500/30 rounded-full flex items-center justify-center">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              </div>
              <div className="absolute w-28 h-[1px] bg-teal-500/20" />
              <div className="absolute h-28 w-[1px] bg-teal-500/20" />
            </div>

            {/* Precise metadata overlay corners */}
            <div className="absolute top-2.5 left-3 text-[9px] font-mono text-slate-200 bg-slate-950/85 px-1.5 py-0.5 rounded border border-slate-800 pointer-events-none z-10">
              Sentinel-2c / monitor
            </div>
            <div className="absolute top-2.5 right-3 text-[9px] font-mono text-emerald-400 bg-slate-950/85 px-1.5 py-0.5 rounded border border-slate-800 pointer-events-none z-10">
              COORDS: [{latitude.toFixed(3)}°, {longitude.toFixed(3)}°]
            </div>
            <div className="absolute bottom-2.5 left-3 text-[9px] font-mono text-slate-300 bg-slate-950/85 px-1.5 py-0.5 rounded border border-slate-800 pointer-events-none z-10">
              ÁREA: {surfaceArea.toLocaleString("es-AR")} m²
            </div>
            <div className="absolute bottom-2.5 right-3 text-[9px] font-mono text-teal-400 bg-slate-950/85 px-1.5 py-0.5 rounded border border-slate-800 pointer-events-none z-10">
              FILTRO: {activeBand === "natural" ? "COLOR RES RGB" : activeBand === "infrared" ? "TELEDETECCIÓN METANO SWIR" : "SAR RADAR DE APERTURA"}
            </div>

            {/* Interactive colored data overlays and scanlines based on selected active band */}
            {activeBand === "natural" && (
              <div className="absolute inset-0 bg-transparent flex items-center justify-center pointer-events-none z-10">
                <div className="text-center bg-slate-950/90 border border-slate-800 p-2 rounded-lg max-w-[190px] animate-fade-in shadow-xl">
                  <p className="text-[10px] font-bold text-slate-100 uppercase tracking-wider">Color Natural</p>
                  <p className="text-[8.5px] text-slate-400 mt-1">Estructura superficial y caminos de arcilla árida natural.</p>
                </div>
              </div>
            )}

            {activeBand === "infrared" && (
              <div className="absolute inset-0 bg-transparent pointer-events-none overflow-hidden flex items-center justify-center z-10">
                {/* Simulated thermography plume flare */}
                <div className="w-28 h-28 rounded-full bg-gradient-to-r from-red-500/40 via-purple-600/35 to-transparent blur-xl animate-pulse" />
                <div className="w-12 h-12 rounded-full bg-yellow-400/40 blur-md absolute animate-ping" style={{ animationDuration: "3s" }} />

                <div className="absolute bottom-10 left-12 text-center bg-red-950/95 border border-red-550/40 px-2 py-1 rounded shadow-lg">
                  <p className="text-[8.5px] font-black font-mono text-red-400 tracking-widest">Anomalía termica gaseosa</p>
                  <p className="text-[8px] font-mono text-slate-300">Banda infrarroja activa</p>
                </div>
              </div>
            )}

            {activeBand === "radar" && (
              <div className="absolute inset-0 bg-transparent pointer-events-none overflow-hidden z-10">
                {/* Rolling radar scan light beam */}
                <div className="absolute h-1 w-full bg-cyan-400/60 shadow-[0_0_10px_rgba(34,211,238,0.85)] top-0 left-0 animate-radar" />
                
                {/* High contrast vector outlines */}
                <svg className="absolute inset-0 w-full h-full opacity-60" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <polygon points="15,45 42,32 65,58 85,42 58,78 32,65" fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeDasharray="3,3" />
                  <polygon points="20,48 38,36 60,54 78,45 54,72 35,62" fill="none" stroke="#0891b2" strokeWidth="0.5" />
                </svg>

                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-slate-950/95 border border-cyan-500/30 px-2.5 py-1.5 rounded-lg max-w-[210px] text-center shadow-2xl">
                    <p className="text-[9.5px] font-mono font-bold text-cyan-400 uppercase">Telemetría sar activa</p>
                    <p className="text-[8px] text-slate-350 mt-0.5">Mapeo electromagnético. Detecta fugas y lodos acumulados.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive controller tabs for bands */}
          <div className="flex bg-slate-900 border border-slate-850 p-1 rounded-xl justify-between items-center mt-2">
            <span className="text-[9.5px] font-mono text-slate-450 hidden sm:inline ml-2 uppercase font-bold">
              Seleccionar Radiación:
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveBand("natural")}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg font-sans transition-colors ${
                  activeBand === "natural" 
                    ? "bg-slate-800 text-slate-100 shadow" 
                    : "text-slate-450 hover:text-slate-200"
                }`}
                type="button"
              >
                Color Natural
              </button>
              <button
                onClick={() => setActiveBand("infrared")}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg font-sans transition-colors ${
                  activeBand === "infrared" 
                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                    : "text-slate-450 hover:text-slate-200"
                }`}
                type="button"
              >
                TIR (Infrarrojo Térmico)
              </button>
              <button
                onClick={() => setActiveBand("radar")}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg font-sans transition-colors ${
                  activeBand === "radar" 
                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" 
                    : "text-slate-450 hover:text-slate-200"
                }`}
                type="button"
              >
                SAR (Radar Radar)
              </button>
            </div>
          </div>

          {/* Educational footnote regarding SkyTruth validation rules */}
          <div className="flex items-start gap-2 mt-4 text-[9.5px] text-slate-400 leading-normal pl-2 border-l border-emerald-500/20">
            <Info className="w-4 h-4 text-emerald-450 shrink-0 mt-0.5" />
            <span>
              <strong>Acreditación Científica:</strong> Las bases libres de SkyTruth promueven la resiliencia cívica ambiental mediante alertas tempranas sustentadas en conjuntos de datos Copernicus Sentinel sin sesgos estatales.
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}
