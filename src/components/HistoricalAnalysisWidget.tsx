import React, { useState } from "react";
import { Hotspot } from "../types";
import { SATELLITE_IMAGES } from "../presets";
import { History, BarChart3, Radio, FileText, ArrowRight, ShieldCheck, CheckCircle, RefreshCw, AlertTriangle } from "lucide-react";

interface HistoricalAnalysisWidgetProps {
  selectedHotspot: Hotspot | null;
  onSelectHotspot: (hotspot: Hotspot) => void;
}

interface HistoricalRecord {
  year: number;
  month: string;
  type: string;
  surfaceArea: number;
  severity: "Crítico" | "Alto" | "Medio" | "Bajo";
  gasRatio: number; // ppm or multiplier of base
  statusText: string;
}

export default function HistoricalAnalysisWidget({ selectedHotspot, onSelectHotspot }: HistoricalAnalysisWidgetProps) {
  const [selectedTimelineYear, setSelectedTimelineYear] = useState<number>(2026);
  const [comparing, setComparing] = useState(false);
  const [autoDetectionsEnabled, setAutoDetectionsEnabled] = useState(true);

  // High-fidelity historical data series for pattern recognition
  const historicalDatabase: Record<string, HistoricalRecord[]> = {
    loma_campana: [
      { year: 2024, month: "Marzo", type: "Acumulación de lodos", surfaceArea: 1100, severity: "Bajo", gasRatio: 1.1, statusText: "Primeras trazas de lodo detectadas por desviación NDVI de suelo. Sin reporte de incidente." },
      { year: 2025, month: "Septiembre", type: "Acumulación de lodos", surfaceArea: 2200, severity: "Medio", gasRatio: 1.9, statusText: "Crecimiento progresivo del piletón sin recubrimiento impermeable certificado. Erosión de suelo colindante." },
      { year: 2026, month: "Junio (Actual)", type: "Acumulación de lodos", surfaceArea: 3200, severity: "Crítico", gasRatio: 3.2, statusText: "Saturación crítica del suelo por escorrentía superficial de hidrocarburos pesados durante tormentas invernales." }
    ],
    bandurria_sur: [
      { year: 2024, month: "Enero", type: "Derrame en suelo", surfaceArea: 1500, severity: "Bajo", gasRatio: 1.0, statusText: "Actividades normales del yacimiento con eventos de salinidad normal en paleocauce." },
      { year: 2025, month: "Julio", type: "Derrame en suelo", surfaceArea: 4100, severity: "Alto", gasRatio: 2.2, statusText: "Falla de junta en tubería de transporte de flowback. Filtración de cloruros extendida." },
      { year: 2026, month: "Junio (Actual)", type: "Derrame en suelo", surfaceArea: 8400, severity: "Crítico", gasRatio: 3.8, statusText: "Derrame masivo no contenido de agua de producción avanzando hacia la ribera norte del Río Neuquén." }
    ],
    aguada_pichana: [
      { year: 2024, month: "Mayo", type: "Anomalía Térmica", surfaceArea: 300, severity: "Bajo", gasRatio: 1.2, statusText: "Antorcha piloto reglamentaria con emisiones normales registradas por Landsat TIR." },
      { year: 2025, month: "Noviembre", type: "Anomalía Térmica", surfaceArea: 900, severity: "Medio", gasRatio: 2.5, statusText: "Eventos de parada de planta imprevistas provocando venteo y combustión de exceso." },
      { year: 2026, month: "Junio (Actual)", type: "Anomalía Térmica", surfaceArea: 1500, severity: "Alto", gasRatio: 4.5, statusText: "Flaring descontrolado con emisiones severas de carbono negro por problemas de compresión." }
    ],
    bajo_del_choique: [
      { year: 2024, month: "Agosto", type: "Venteo Atmosférico", surfaceArea: 100, severity: "Bajo", gasRatio: 1.5, statusText: "Pérdidas fugitivas menores en válvulas de cabeza de pozo." },
      { year: 2025, month: "Febrero", type: "Venteo Atmosférico", surfaceArea: 250, severity: "Medio", gasRatio: 5.4, statusText: "Aumento progresivo de anomalía de metano silenciosa detectada por sensor TROPOMI." },
      { year: 2026, month: "Junio (Actual)", type: "Venteo Atmosférico", surfaceArea: 400, severity: "Alto", gasRatio: 12.4, statusText: "Venteo continuo no controlado a la atmósfera de gas metano enriquecido." }
    ],
    el_orejano: [
      { year: 2024, month: "Octubre", type: "Derrame en suelo", surfaceArea: 1200, severity: "Bajo", gasRatio: 1.1, statusText: "Operación de acopio temporal de tierras con bajo impacto biológico." },
      { year: 2025, month: "Diciembre", type: "Derrame en suelo", surfaceArea: 2900, severity: "Medio", gasRatio: 1.8, statusText: "Infiltraciones laterales de lodos oleosos fuera de la celda de remediación autorizada." },
      { year: 2026, month: "Junio (Actual)", type: "Derrame en suelo", surfaceArea: 4800, severity: "Medio", gasRatio: 2.8, statusText: "Crecimiento progresivo y no mitigado de tierras contaminadas con degradación vegetal NDVI." }
    ]
  };

  const currentRecords = selectedHotspot ? historicalDatabase[selectedHotspot.id] : [];
  const activeTimelineRecord = currentRecords.find(r => r.year === selectedTimelineYear) || currentRecords[currentRecords.length - 1];

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6" id="historical-time-repository">
      {/* Header and Live stats */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2 text-[9px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded font-mono">
              HISTÓRICOS & BIG DATA
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span>ALG_CAMBIO: ACTIVE</span>
            </div>
          </div>
          <h3 className="text-base font-black text-slate-100 font-sans mt-0.5">
            Análisis de Series Temporales y Patrones Satelitales (2024 - 2026)
          </h3>
        </div>

        <button
          onClick={() => setAutoDetectionsEnabled(!autoDetectionsEnabled)}
          className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono transition-all flex items-center gap-1.5 ${
            autoDetectionsEnabled 
              ? "bg-teal-500/10 border-teal-500 text-teal-300"
              : "bg-slate-900 border-slate-800 text-slate-500"
          }`}
          id="btn-alert-autodetection"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Alertas de Cambio: {autoDetectionsEnabled ? "ON" : "OFF"}</span>
        </button>
      </div>

      {/* Plan de Integración de Repositorio de Datos Históricos (Requested explicitly by user) */}
      <div className="bg-slate-950/80 p-4 border border-slate-850 rounded-xl space-y-3 font-sans">
        <h4 className="text-xs font-bold text-teal-400 tracking-wider uppercase font-mono flex items-center gap-1.5">
          <FileText className="w-4 h-4" />
          <span>Plan de Integración del Repositorio de Datos Históricos (HSE Vaca Muerta)</span>
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-relaxed text-slate-300">
          <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-teal-400 font-bold block">1. Ingesta Multi-Sensor</span>
            <p className="text-[11px] text-slate-400">
              Conexión directa vía APIs automáticas de Copernicus Sentinel-2 (NDVI y SWIR), Landsat Thermal Infrared (TIR) y satélites comerciales de alta resolución (30cm) para mapear acumulación de tierras.
            </p>
          </div>
          <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-teal-400 font-bold block">2. Reconocimiento de Patrones</span>
            <p className="text-[11px] text-slate-400">
              Uso de algoritmos de clasificación no supervisada (Random Forest/SVM) entrenados con firmas espectrales locales para discernir entre derrame de crudo pesado, flowback salino y suelo xerófilo natural.
            </p>
          </div>
          <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-800 space-y-1">
            <span className="text-teal-400 font-bold block">3. Alerta y Trazabilidad</span>
            <p className="text-[11px] text-slate-400">
              Disparadores automáticos al detectar crecimiento de área (&gt;15% en 30 días) para alertas inmediatas a reguladores (OPDS / Subsecretaría de Neuquén), facilitando auditorías históricas transparentes.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Temporal Slider Line */}
      {selectedHotspot && (
        <div className="space-y-4 pt-2">
          <div className="flex justify-between items-center bg-slate-950 px-4 py-3 rounded-xl border border-slate-850">
            <span className="text-xs text-slate-400 font-mono">SELECCIÓN DE LÍNEA TEMPORAL SENSOR:</span>
            <div className="flex gap-2 font-mono text-xs">
              {[2024, 2025, 2026].map(yr => (
                <button
                  key={yr}
                  onClick={() => setSelectedTimelineYear(yr)}
                  className={`px-3.5 py-1 rounded-md border font-bold transition-all ${
                    selectedTimelineYear === yr
                      ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-950/40 scale-105"
                      : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                  id={`year-timeline-btn-${yr}`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>

          {/* Temporal data overview */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
            {/* Visual satellite signature mockup overlay */}
            <div className="md:col-span-4 relative h-36 rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
              <div className="absolute top-1 left-2 text-[8px] text-indigo-400 font-mono tracking-wider z-10 bg-slate-950/80 px-1 py-0.5 rounded">
                ESPECTRO {activeTimelineRecord.year} | {activeTimelineRecord.month}
              </div>
              <img 
                src={selectedHotspot.imageUrl} 
                alt="Firma espectral satélite" 
                className="w-full h-full object-cover opacity-60 filter saturate-150"
                referrerPolicy="no-referrer"
              />
              {/* Fake grid metrics representation */}
              <div className="absolute bottom-2 left-2 right-2 text-[9px] font-mono text-slate-400 bg-slate-900/90 p-1.5 rounded border border-slate-800/80">
                <div className="flex justify-between">
                  <span>Saturación del Suelo:</span>
                  <span className="text-teal-400 font-bold">{(activeTimelineRecord.surfaceArea * 0.003).toFixed(1)}%</span>
                </div>
              </div>
            </div>

            {/* Explanatory text card */}
            <div className="md:col-span-8 space-y-3">
              <div className="flex justify-between items-baseline">
                <h4 className="text-sm font-bold text-slate-100 font-sans">
                  Estado Registrado por Telemetría: <span className="text-indigo-400 font-mono">Año {activeTimelineRecord.year}</span>
                </h4>
                <span className={`text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded-full ${
                  activeTimelineRecord.severity === "Crítico" ? "bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse" :
                  activeTimelineRecord.severity === "Alto" ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" :
                  activeTimelineRecord.severity === "Medio" ? "bg-amber-500/10 text-amber-400" : "bg-emerald-500/10 text-emerald-400"
                }`}>
                  {activeTimelineRecord.severity}
                </span>
              </div>
              
              <p className="text-xs text-slate-300 leading-relaxed italic bg-slate-900/30 p-3 rounded-lg border border-slate-850">
                "{activeTimelineRecord.statusText}"
              </p>

              {/* Grid indices */}
              <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
                <div className="bg-slate-950 p-2 rounded border border-slate-900 flex justify-between">
                  <span className="text-slate-500">Superficie de Anomalía:</span>
                  <span className="text-indigo-300 font-bold">{activeTimelineRecord.surfaceArea} m²</span>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-900 flex justify-between">
                  <span className="text-slate-500">Emisiones de Gas (CH₄):</span>
                  <span className="text-indigo-300 font-bold">
                    {(selectedHotspot.ch4Value * (activeTimelineRecord.gasRatio / 3)).toFixed(2)} ppm
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recurrence & soil growth pattern statistics chart layout (Interactive and visual) */}
          <div className="pt-2 border-t border-slate-850">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-bold text-slate-400 font-mono tracking-wider">
                📈 EVOLUCIÓN HISTÓRICA DE AGREGACIÓN & CRECIMIENTO DE SUELO CONTAMINADO
              </span>
              <span className="text-[10px] text-rose-400 uppercase font-mono font-black flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                Crecimiento: +{((currentRecords[currentRecords.length - 1].surfaceArea / currentRecords[0].surfaceArea - 1) * 100).toFixed(0)}% desde 2024
              </span>
            </div>

            {/* Custom SVG Data Visualization of Land Saturation Area */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 h-28 flex flex-col justify-between">
              <div className="flex-1 flex gap-4 items-end pt-2">
                {currentRecords.map((rec, i) => {
                  const maxSurface = Math.max(...currentRecords.map(r => r.surfaceArea));
                  const percentageHeight = (rec.surfaceArea / maxSurface) * 100;
                  const isCurrent = rec.year === selectedTimelineYear;

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                      <span className={`text-[9px] font-mono leading-none ${isCurrent ? "font-black text-indigo-400" : "text-slate-450"}`}>
                        {rec.surfaceArea} m²
                      </span>
                      <div 
                        className={`w-full rounded-t-md transition-all duration-500 ${
                          isCurrent 
                            ? "bg-gradient-to-t from-indigo-600/80 to-indigo-400 border-t border-indigo-300 shadow-md shadow-indigo-900" 
                            : "bg-slate-800 hover:bg-slate-700"
                        }`}
                        style={{ height: `${percentageHeight * 0.7}%` }}
                      ></div>
                      <span className={`text-[10px] font-mono ${isCurrent ? "font-bold text-slate-100" : "text-slate-500"}`}>
                        {rec.year}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
