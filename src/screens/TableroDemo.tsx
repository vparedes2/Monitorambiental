import React, { useState, useEffect } from "react";
import { PRESET_HOTSPOTS } from "../presets";
import { useSesion } from "../lib/sesion";
import { Hotspot, AnalysisResponse } from "../types";
import VacaMuertaMap from "../components/VacaMuertaMap";
import GaseousAtmosphereWidget from "../components/GaseousAtmosphereWidget";
import AuditorReportViewer from "../components/AuditorReportViewer";
import IncidentForm from "../components/IncidentForm";
import HistoricalAnalysisWidget from "../components/HistoricalAnalysisWidget";
import StationsSummaryDashboard from "../components/StationsSummaryDashboard";
import SatelliteConnectionPanel from "../components/SatelliteConnectionPanel";
import HydrologicalAnalysisWidget from "../components/HydrologicalAnalysisWidget";
import MethodologicalAuditPanel from "../components/MethodologicalAuditPanel";
import GHGSatSpectraWidget from "../components/GHGSatSpectraWidget";
import SkyEarthPortal from "../components/SkyEarthPortal";
import VenteosMonitorModule from "../components/VenteosMonitorModule";
import { ShieldAlert, Compass, Activity, CheckCircle, Database, Wind, Droplet, Layers, Flame } from "lucide-react";

export default function TableroDemo({ vista }: { vista: "general" | "venteos" }) {
  const activeTab = vista;
  const { puede } = useSesion();
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot>(PRESET_HOTSPOTS[0]);
  const [report, setReport] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // States to collapse/expand sections by environmental Axis
  const [isSelectorOpen, setIsSelectorOpen] = useState(false); // Collapsed by default for a minimalist and clean layout
  const [isAirOpen, setIsAirOpen] = useState(true);
  const [isWaterOpen, setIsWaterOpen] = useState(false);
  const [isSoilOpen, setIsSoilOpen] = useState(false);

  // Trigger Gemini HSE expert analysis on mount for the default Lomac preset
  useEffect(() => {
    if (selectedHotspot) {
      handleRunAnalysis({
        latitude: selectedHotspot.latitude,
        longitude: selectedHotspot.longitude,
        windSpeed: selectedHotspot.windSpeed,
        windDirection: selectedHotspot.windDirection,
        ch4Value: selectedHotspot.ch4Value,
        co2Value: selectedHotspot.co2Value,
        no2Value: selectedHotspot.no2Value,
        so2Value: selectedHotspot.so2Value,
        surfaceArea: selectedHotspot.surfaceArea,
        type: selectedHotspot.type,
        description: selectedHotspot.description,
        image: selectedHotspot.imageUrl
      });
    }
  }, []);

  const handleSelectHotspot = (hotspot: Hotspot) => {
    setSelectedHotspot(hotspot);
    handleRunAnalysis({
      latitude: hotspot.latitude,
      longitude: hotspot.longitude,
      windSpeed: hotspot.windSpeed,
      windDirection: hotspot.windDirection,
      ch4Value: hotspot.ch4Value,
      co2Value: hotspot.co2Value,
      no2Value: hotspot.no2Value,
      so2Value: hotspot.so2Value,
      surfaceArea: hotspot.surfaceArea,
      type: hotspot.type,
      description: hotspot.description,
      image: hotspot.imageUrl
    });
  };

  const handleRunAnalysis = async (params: any) => {
    if (!puede("demo.ia")) { setError("Tu usuario no tiene habilitado el análisis con IA. Consultá con el administrador."); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(params)
      });
      if (!res.ok) {
        throw new Error("El auditor de IA no pudo completar el informe. Verifique la conexión.");
      }
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error al solicitar análisis de teledetección.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="legado min-h-screen text-slate-100 font-sans pb-12 pt-4" id="vaca-muerta-platform-root">
      {/* Upper Navigation / Bar */}
      {activeTab === "venteos" ? (
        <div className="max-w-7xl mx-auto px-4 mt-6">
          <VenteosMonitorModule />
        </div>
      ) : (
        <>
      {/* Main Alert Notification Banner: grows and alerts on real-time soil accumulation and conflict sites */}
      <div className="max-w-7xl mx-auto px-4 mt-6">
        <div className="p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-200 text-xs leading-relaxed">
          <b>Aviso de datos:</b> los yacimientos de este selector y sus valores de CH₄, CO₂, NO₂, SO₂, agua y suelo son <b>ejemplos de demostración cargados en el código</b>, no mediciones satelitales. Los únicos datos reales en vivo son los focos térmicos de NASA FIRMS (módulo de venteos, requiere FIRMS_MAP_KEY) y el listado de escenas del catálogo Copernicus.
        </div>
      </div>
      <header className="max-w-7xl mx-auto px-4 mt-6" id="critical-hotspots-selection">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl relative transition-colors">
          <button
            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-teal-950/15 via-slate-900 to-slate-900 hover:bg-slate-850/60 transition-colors text-left"
            id="toggle-selector-button"
            type="button"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-teal-500/10 rounded-xl border border-teal-500/20 text-teal-400">
                <Compass className={`w-5 h-5 transition-transform duration-500 ${isSelectorOpen ? 'rotate-45' : 'rotate-12'}`} />
              </div>
              <div>
                <h2 className="text-[10px] font-black text-teal-400 tracking-wider uppercase font-mono mb-0.5">
                  Sensor filtrador de yacimientos
                </h2>
                <h3 className="text-sm font-extrabold text-slate-150 font-sans tracking-tight">
                  {isSelectorOpen ? "Selección de Yacimientos Activos Vaca Muerta" : `Yacimiento Activo: ${
                    selectedHotspot?.id === "loma_campana" ? "Loma Campana" : 
                    selectedHotspot?.id === "bandurria_sur" ? "Bandurria Sur" : 
                    selectedHotspot?.id === "rio_neuquen_derrame" ? "Río Neuquén" :
                    selectedHotspot?.id === "aguada_pichana" ? "Aguada Pichana" : 
                    selectedHotspot?.id === "bajo_del_choique" ? "Bajo del Choique" : "El Orejano"
                  }`}
                </h3>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-[10.5px] font-bold shrink-0 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-800">
              {isSelectorOpen ? (
                <span className="flex items-center gap-1 text-teal-400">Minimizar Panel <strong className="text-sm font-black font-mono">-</strong></span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">Cambiar Yacimiento <strong className="text-sm font-black font-mono">+</strong></span>
              )}
            </div>
          </button>

          {isSelectorOpen ? (
            <div className="p-5 border-t border-slate-800 bg-slate-950/20 space-y-4">
              <p className="text-xs text-slate-350 leading-relaxed max-w-4xl">
                <strong>Interactividad de Telemetría:</strong> Al presionar cualquier foco de la lista inferior, el sistema re-calibra de inmediato los mapas satelitales, sensores de gases, simulación de viento y ejecuta una auditoría de mitigación de IA en tiempo real.
              </p>
              
              {/* Quick selectors matching hotspots presets */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3" id="hotspots-interactive-panel">
                {PRESET_HOTSPOTS.map((preset) => {
                  const isActive = selectedHotspot?.id === preset.id;
                  const isCrit = preset.status === "Crítico";
                  
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handleSelectHotspot(preset)}
                      className={`text-left p-3.5 rounded-xl border transition-colors duration-300 relative ${
                        isActive 
                          ? "bg-slate-900 border-teal-400 ring-2 ring-teal-400/25 shadow-xl shadow-teal-555/10 scale-[1.02]" 
                          : "bg-slate-950/45 border-slate-850 hover:bg-slate-900 hover:border-slate-850 cursor-pointer"
                      }`}
                      id={`preset-button-${preset.id}`}
                      type="button"
                    >
                      {/* Active monitoring status badge */}
                      {isActive && (
                        <div className="absolute -top-2.5 -right-1.5 bg-teal-500 text-slate-950 text-[8px] font-black font-mono px-2 py-0.5 rounded shadow-md uppercase tracking-wider animate-bounce">
                          ACTIVO
                        </div>
                      )}

                      {/* Tiny pulsing indicator */}
                      <div className="flex justify-between items-center mb-1">
                        <span className={`text-[9.5px] font-extrabold font-mono py-0.5 px-1.5 rounded uppercase ${
                          isCrit ? "text-red-400 bg-red-500/10" : "text-amber-400 bg-amber-500/10"
                        }`}>
                          {preset.status}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-teal-400 animate-ping" : "bg-slate-700"}`}></span>
                      </div>
                      
                      <h4 className={`text-xs font-bold font-sans text-ellipsis overflow-hidden whitespace-nowrap mt-1 ${isActive ? "text-teal-350" : "text-slate-100"}`}>
                        {preset.id === "loma_campana" ? "Loma Campana" : 
                         preset.id === "bandurria_sur" ? "Bandurria Sur" : 
                         preset.id === "rio_neuquen_derrame" ? "Río Neuquén" :
                         preset.id === "aguada_pichana" ? "Aguada Pichana" : 
                         preset.id === "bajo_del_choique" ? "Bajo del Choique" : "El Orejano"}
                      </h4>
                      <p className="text-[10.5px] text-slate-400 font-mono mt-0.5 leading-snug">
                        {preset.locationName.split(" (")[0]}
                      </p>
                      <div className="flex justify-between items-center text-[9px] text-slate-450 font-mono mt-2.5 pt-2 border-t border-slate-900">
                        <span>{preset.surfaceArea.toLocaleString("es-AR")} m²</span>
                        <span className={`${isActive ? "text-teal-400 font-bold" : "text-slate-500"}`}>
                          Viento: {preset.windDirection}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">ID ACTIVIDAD:</span>
                <span className={`text-[10px] font-extrabold font-mono py-0.5 px-2 bg-teal-500/10 text-teal-400 rounded border border-teal-500/20 uppercase`}>
                  {selectedHotspot?.id === "loma_campana" ? "Loma Campana" : 
                   selectedHotspot?.id === "bandurria_sur" ? "Bandurria Sur" : 
                   selectedHotspot?.id === "rio_neuquen_derrame" ? "Río Neuquén" :
                   selectedHotspot?.id === "aguada_pichana" ? "Aguada Pichana" : 
                   selectedHotspot?.id === "bajo_del_choique" ? "Bajo del Choique" : "El Orejano"}
                </span>
                <span className="text-slate-400 text-[11px] font-sans">
                  • {selectedHotspot?.locationName} • <span className="text-red-400 font-mono font-bold">Gravedad {selectedHotspot?.status}</span>
                </span>
              </div>
              <button
                onClick={() => setIsSelectorOpen(true)}
                className="text-[11px] font-mono font-bold text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1.5"
                type="button"
              >
                Abrir Selector de Focos ▾
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Core Bento Layout */}
      <main className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-6" id="bento-grid">
        {/* Left Column (SVG MAP & CONTROL FORM) */}
        <section className="lg:col-span-5 space-y-6 flex flex-col" id="left-controls-column">
          {/* Interactive GIS Vaca Muerta Map */}
          <VacaMuertaMap 
            hotspots={PRESET_HOTSPOTS}
            selectedHotspot={selectedHotspot}
            onSelectHotspot={handleSelectHotspot}
            customIncident={null}
          />

          {/* Configuration Form Data */}
          <IncidentForm 
            selectedHotspot={selectedHotspot}
            onRunAnalysis={handleRunAnalysis}
            loading={loading}
          />
        </section>

        {/* Right Column (AUDITOR RESULTS & COPERNICUS Telemetry) */}
        <section className="lg:col-span-7 space-y-6 flex flex-col" id="right-results-column">
          {error && (
            <div className="p-4 bg-red-950/50 border border-red-500/30 rounded-xl text-red-350 text-xs font-mono flex items-start gap-2.5" id="analyzer-error-alert">
              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
              <div>
                <strong className="block font-bold">Falla en la Inspección Satelital:</strong>
                <p className="mt-0.5">{error}</p>
                <button 
                  onClick={() => handleSelectHotspot(selectedHotspot)}
                  className="mt-2 text-[10px] text-teal-400 underline"
                >
                  Re-intentar análisis automático
                </button>
              </div>
            </div>
          )}

          {/* Expert HSE report evaluation viewport */}
          <AuditorReportViewer 
            report={report} 
            loading={loading} 
            selectedHotspot={selectedHotspot}
          />

          {/* Copernicus Gas Bar widgets */}
          {selectedHotspot && (
            <GaseousAtmosphereWidget 
              hotspot={selectedHotspot} 
            />
          )}
        </section>
      </main>

      {/* SECCIÓN PRINCIPAL: EJES AMBIENTALES MULTIVARIADOS DE VACA MUERTA */}
      <section className="max-w-7xl mx-auto px-4 mt-12 space-y-6" id="environmental-axis-section-fold">
        
        {/* Central controller banner */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-4">
          <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <h3 className="text-xs font-bold text-teal-400 font-mono uppercase tracking-wider mb-0.5">
                Organización de telemetría subespecializada
              </h3>
              <h2 className="text-base font-extrabold text-slate-100 font-sans">
                Ejes Sensoriales: Aire, Agua y Suelo
              </h2>
              <p className="text-xs text-slate-400 mt-1.5 max-w-3xl leading-relaxed">
                Para diagnosticar desvíos de manera limpia sin saturar su interfaz, hemos consolidado todos los paneles en tres ejes prioritarios. Expanda o colapse cada eje utilizando los investigadores interactivos <span className="text-teal-400 font-mono font-bold">[ + ]</span> o <span className="text-teal-400 font-mono font-bold">[ - ]</span>.
              </p>
            </div>
            
            {/* Quick multi-toggle buttons */}
            <div className="flex gap-2 shrink-0">
              <button 
                onClick={() => { setIsAirOpen(true); setIsWaterOpen(true); setIsSoilOpen(true); }}
                className="px-3 py-1.5 bg-slate-950 border border-slate-850 hover:border-slate-700 text-[10px] font-bold font-mono text-slate-300 rounded-xl uppercase transition-colors"
                type="button"
              >
                Expandir Todo [ + ]
              </button>
              <button 
                onClick={() => { setIsAirOpen(false); setIsWaterOpen(false); setIsSoilOpen(false); }}
                className="px-3 py-1.5 bg-slate-950 border border-slate-850 hover:border-slate-700 text-[10px] font-bold font-mono text-slate-400 rounded-xl uppercase transition-colors"
                type="button"
              >
                Colapsar Todo [ - ]
              </button>
            </div>
          </div>
        </div>

        {/* 1. EJE AMBIENTAL: AIRE Y ATMÓSFERA */}
        <div className="bg-slate-900/40 border border-slate-850 rounded-2xl overflow-hidden shadow-md" id="air-collapsible-container">
          <button
            onClick={() => setIsAirOpen(!isAirOpen)}
            className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-cyan-950/20 to-teal-950/10 hover:bg-slate-905 transition-colors text-left group"
            type="button"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-cyan-400">
                <Wind className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="text-sm font-black tracking-wide text-slate-200 font-sans flex items-center gap-2">
                  Eje aire y telemetría atmosférica
                  <span className="text-[9.5px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded font-bold uppercase border border-cyan-900/20">
                    2 Componentes
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 font-sans">
                  Sondas de contaminación, análisis espectral GHGSat de metano y calibración continua de Sentinel-5P.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold shrink-0 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-850">
              {isAirOpen ? (
                <span className="flex items-center gap-1 text-teal-450">Colapsar <strong className="text-base font-black font-mono">-</strong></span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">Expandir <strong className="text-base font-black font-mono">+</strong></span>
              )}
            </div>
          </button>
          
          {isAirOpen && (
            <div className="p-6 border-t border-slate-850 space-y-6 bg-slate-955/20 animate-fade-in">
              {/* GHGSat spectral methane model */}
              <GHGSatSpectraWidget selectedHotspot={selectedHotspot} />
              
              {/* Official satellite connections API setup */}
              <SatelliteConnectionPanel selectedHotspot={selectedHotspot} />
            </div>
          )}
        </div>

        {/* 2. EJE AMBIENTAL: AGUA Y CUENCAS HIDROLÓGICAS */}
        <div className="bg-slate-900/40 border border-slate-850 rounded-2xl overflow-hidden shadow-md" id="water-collapsible-container">
          <button
            onClick={() => setIsWaterOpen(!isWaterOpen)}
            className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-blue-950/20 to-cyan-950/10 hover:bg-slate-905 transition-colors text-left group"
            type="button"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-400">
                <Droplet className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black tracking-wide text-slate-200 font-sans flex items-center gap-2">
                  Eje agua, Acuíferos y cuencas hidrológicas
                  <span className="text-[9.5px] font-mono text-blue-400 bg-blue-950 px-2 py-0.5 rounded font-bold uppercase border border-blue-900/20">
                    Activo
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 font-sans">
                  Saturación de napas, conductividad de lagos de retención y cuenca hídrica de los Ríos Neuquén y Colorado.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold shrink-0 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-850">
              {isWaterOpen ? (
                <span className="flex items-center gap-1 text-teal-455">Colapsar <strong className="text-base font-black font-mono">-</strong></span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">Expandir <strong className="text-base font-black font-mono">+</strong></span>
              )}
            </div>
          </button>
          
          {isWaterOpen && (
            <div className="p-6 border-t border-slate-850 bg-slate-955/20 animate-fade-in">
              <HydrologicalAnalysisWidget />
            </div>
          )}
        </div>

        {/* 3. EJE AMBIENTAL: SUELO, HISTORIAL Y GEOLOCALIZACIÓN INTEGRADA */}
        <div className="bg-slate-900/40 border border-slate-855 rounded-2xl overflow-hidden shadow-md" id="soil-collapsible-container">
          <button
            onClick={() => setIsSoilOpen(!isSoilOpen)}
            className="w-full flex items-center justify-between p-5 bg-gradient-to-r from-emerald-950/20 to-amber-950/10 hover:bg-slate-905 transition-colors text-left group"
            type="button"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-emerald-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black tracking-wide text-slate-200 font-sans flex items-center gap-2">
                  Eje suelo, Monitoreo geográfico y auditoría general
                  <span className="text-[9.5px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded font-bold uppercase border border-emerald-900/20">
                    4 Componentes
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5 font-sans">
                  Inspección directa SkyTruth / Google Earth, comparador regional de gases, bitácoras históricas y auditoría de confiabilidad.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs font-bold shrink-0 bg-slate-950 px-3.5 py-1.5 rounded-xl border border-slate-850">
              {isSoilOpen ? (
                <span className="flex items-center gap-1 text-teal-450">Colapsar <strong className="text-base font-black font-mono">-</strong></span>
              ) : (
                <span className="flex items-center gap-1 text-slate-400">Expandir <strong className="text-base font-black font-mono">+</strong></span>
              )}
            </div>
          </button>
          
          {isSoilOpen && (
            <div className="p-6 border-t border-slate-850 space-y-6 bg-slate-955/20 animate-fade-in">
              {/* SkyTruth & Google Earth Integrated Portal */}
              <SkyEarthPortal selectedHotspot={selectedHotspot} />

              {/* Stations summary database indicator */}
              <StationsSummaryDashboard
                hotspots={PRESET_HOTSPOTS}
                onSelectStation={handleSelectHotspot}
                selectedStationId={selectedHotspot?.id}
              />

              {/* Historic log analytics of spills */}
              <HistoricalAnalysisWidget 
                selectedHotspot={selectedHotspot} 
                onSelectHotspot={handleSelectHotspot}
              />

              {/* Audit matrix verification panel */}
              <MethodologicalAuditPanel />
            </div>
          )}
        </div>

      </section>
        </>
      )}

      {/* Footer credits and references */}

    </div>
  );
}
