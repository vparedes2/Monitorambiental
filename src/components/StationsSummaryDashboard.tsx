import React, { useState, useEffect } from "react";
import * as d3 from "d3";
import { Hotspot } from "../types";
import { PRESET_HOTSPOTS } from "../presets";
import { BarChart3, ShieldAlert, Award, Radio, Flame, Sparkles, HelpCircle, ArrowRightLeft, Info, HelpCircle as HelpIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface StationsSummaryDashboardProps {
  hotspots: Hotspot[];
  onSelectStation: (hotspot: Hotspot) => void;
  selectedStationId?: string;
}

export default function StationsSummaryDashboard({
  hotspots = PRESET_HOTSPOTS,
  onSelectStation,
  selectedStationId
}: StationsSummaryDashboardProps) {
  // Navigation / View modes for the Dashboard
  const [viewMode, setViewMode] = useState<"SMALL_MULTIPLES" | "CONSOLIDATED" | "HAZARD_INDEX">("SMALL_MULTIPLES");
  const [selectedGas, setSelectedGas] = useState<"CH4" | "CO2" | "NO2" | "SO2">("CH4");
  
  // Real-time sensor simulation state for live feeds
  const [liveTelemetry, setLiveTelemetry] = useState<Record<string, { ch4: number; co2: number; timestamp: string }>>({});
  const [isSimulating, setIsSimulating] = useState(true);

  // Initialize and run the live telemetry simulation
  useEffect(() => {
    const initTelemetry = () => {
      const initial: Record<string, { ch4: number; co2: number; timestamp: string }> = {};
      hotspots.forEach((h) => {
        initial[h.id] = {
          ch4: h.ch4Value,
          co2: h.co2Value,
          timestamp: new Date().toLocaleTimeString("es-AR", { hour12: false })
        };
      });
      setLiveTelemetry(initial);
    };

    initTelemetry();

    if (!isSimulating) return;

    const interval = setInterval(() => {
      setLiveTelemetry((prev) => {
        const next = { ...prev };
        hotspots.forEach((h) => {
          if (next[h.id]) {
            // Add a small realistic fluctuation (-10% to +10%)
            const deltaCH4 = (Math.random() - 0.5) * 0.15 * h.ch4Value;
            const deltaCO2 = (Math.random() - 0.5) * 0.08 * h.co2Value;
            next[h.id] = {
              ch4: Math.max(1.8, Number((h.ch4Value + deltaCH4).toFixed(2))),
              co2: Math.max(400, Math.round(h.co2Value + deltaCO2)),
              timestamp: new Date().toLocaleTimeString("es-AR", { hour12: false })
            };
          }
        });
        return next;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [hotspots, isSimulating]);

  // Utility to calculate a multi-metric Hazard Index (Severity Indicator)
  const calculateHazardScore = (h: Hotspot) => {
    // Normalization factors based on limits
    // CH4 typical max 12.4, threshold 2.5
    // CO2 typical max 580, threshold 450
    // NO2 typical max 72, threshold 40
    // SO2 typical max 48, threshold 20
    const ch4Norm = Math.min(10, h.ch4Value / 2.0);
    const co2Norm = Math.min(10, h.co2Value / 440);
    const no2Norm = Math.min(10, h.no2Value / 30);
    const so2Norm = Math.min(10, h.so2Value / 20);
    const surfaceNorm = Math.min(10, Math.sqrt(h.surfaceArea) / 30);

    // Weighted average
    const score = (ch4Norm * 3.0 + co2Norm * 1.5 + no2Norm * 2.0 + so2Norm * 1.5 + surfaceNorm * 2.0) / 10;
    return Number((score * 10).toFixed(1)); // Scale to 0-100 range
  };

  const getHazardCategory = (score: number) => {
    if (score >= 75) return { label: "Extremo/Crítico", color: "text-red-500 bg-red-500/10", border: 'border-red-500/20', bar: "bg-red-500" };
    if (score >= 50) return { label: "Alto", color: "text-orange-500 bg-orange-500/10", border: 'border-orange-500/20', bar: "bg-orange-500" };
    if (score >= 30) return { label: "Moderado", color: "text-amber-500 bg-amber-500/10", border: 'border-amber-500/20', bar: "bg-amber-500" };
    return { label: "Bajo", color: "text-teal-500 bg-teal-500/10", border: 'border-teal-500/20', bar: "bg-teal-500" };
  };

  // Gas specifications for rendering titles, limits and units
  const gasMeta = {
    CH4: { label: "Metano (CH4)", unit: "ppm", threshold: 2.5, desc: "Potente gas de efecto invernadero asociado a pérdidas o venteos crudos." },
    CO2: { label: "Dióxido de Carbono (CO2)", unit: "ppm", threshold: 450, desc: "Gas resultante del flaring (procesos de quemado ineficientes) en cabeza de pozo." },
    NO2: { label: "Dióxido de Nitrógeno (NO2)", unit: "ppb", threshold: 40, desc: "Resultante del calor extremo en turbinas de producción y antorchas activas." },
    SO2: { label: "Dióxido de Azufre (SO2)", unit: "ppb", threshold: 20, desc: "Compuesto ácido altamente corrosivo liberado en la refinación secundaria." }
  };

  // Render a Single SVG Bar Chart powered by D3 Scales
  const renderD3BarChart = (gasKey: "CH4" | "CO2" | "NO2" | "SO2", height = 150) => {
    const data = hotspots;
    const values = data.map((d) => {
      if (gasKey === "CH4") return d.ch4Value;
      if (gasKey === "CO2") return d.co2Value;
      if (gasKey === "NO2") return d.no2Value;
      return d.so2Value;
    });

    const maxVal = d3.max(values) || 1;
    const meta = gasMeta[gasKey];
    
    // Setup scales
    const yScale = d3.scaleLinear()
      .domain([0, maxVal * 1.15]) // Leave headroom
      .range([0, height]);

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between" id={`d3-card-${gasKey}`}>
        <div className="mb-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-150 font-sans">{meta.label}</span>
            <span className="text-[10px] font-mono text-teal-400 font-bold bg-teal-500/10 px-1.5 py-0.5 rounded">
              Límite Legal: {meta.threshold} {meta.unit}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1 leading-snug">{meta.desc}</p>
        </div>

        {/* SVG Visualization Area */}
        <div className="w-full relative py-2" style={{ height: `${height}px` }}>
          <svg className="w-full h-full" overflow="visible">
            {/* Guide line for the legal limit */}
            {meta.threshold <= maxVal * 1.1 && (
              <g>
                <line
                  x1="0"
                  y1={height - yScale(meta.threshold)}
                  x2="100%"
                  y2={height - yScale(meta.threshold)}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  className="animate-pulse"
                />
                <text
                  x="4"
                  y={height - yScale(meta.threshold) - 3}
                  fill="#f87171"
                  fontSize="8"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  CRÍTICO ({meta.threshold})
                </text>
              </g>
            )}

            {/* Render Bars for all 5 stations */}
            {data.map((h, idx) => {
              const val = gasKey === "CH4" ? h.ch4Value : gasKey === "CO2" ? h.co2Value : gasKey === "NO2" ? h.no2Value : h.so2Value;
              const barHeight = yScale(val);
              const xPos = `${(idx / data.length) * 100}%`;
              const widthPerc = `${85 / data.length}%`;
              const isOverLimit = val > meta.threshold;
              const isSelected = selectedStationId === h.id;

              // Color codes
              const barColor = isOverLimit ? "fill-red-500/80 hover:fill-red-400" : "fill-teal-500/70 hover:fill-teal-400";
              const strokeColor = isSelected ? "#14b8a6" : isOverLimit ? "#ef4444" : "#475569";
              const strokeWidth = isSelected ? "2.5" : "1";

              return (
                <g 
                  key={`${gasKey}-bar-${h.id}`} 
                  className="cursor-pointer group"
                  onClick={() => onSelectStation(h)}
                >
                  <rect
                    x={xPos}
                    y={height - barHeight}
                    width={widthPerc}
                    height={Math.max(2, barHeight)}
                    className={`${barColor} transition-all duration-300`}
                    rx="3"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    id={`bar-${gasKey}-${h.id}`}
                  />
                  {/* Dynamic value text above the bar */}
                  <text
                    x={`calc(${(idx / data.length) * 100}% + ${(42.5 / data.length)}%)`}
                    y={height - barHeight - 6}
                    textAnchor="middle"
                    fill={isOverLimit ? "#f87171" : "#94a3b8"}
                    fontSize="9"
                    fontFamily="monospace"
                    fontWeight="bold"
                    id={`text-${gasKey}-${h.id}`}
                  >
                    {val}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* X-axis legends */}
        <div className="flex justify-between text-[8px] font-mono text-slate-500 pt-2 border-t border-slate-800 mt-2">
          {data.map((h) => {
            const shortName = h.id === "loma_campana" ? "LomaCampana" :
                              h.id === "bandurria_sur" ? "BandurriaSur" :
                              h.id === "aguada_pichana" ? "Ag Pichana" :
                              h.id === "bajo_del_choique" ? "B Choique" : "El Orejano";
            const isSelected = selectedStationId === h.id;
            return (
              <span 
                key={`lbl-${gasKey}-${h.id}`} 
                className={`truncate max-w-[18%] ${isSelected ? "text-teal-400 font-extrabold underline" : ""}`}
                title={h.name}
              >
                {shortName}
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div id="stations-summary-dashboard-card" className="w-full bg-slate-900/40 border border-slate-850 rounded-2xl p-6 shadow-xl relative overflow-hidden mt-6 animate-fade-in">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <BarChart3 className="w-32 h-32 text-teal-400" />
      </div>

      {/* Title & Introduction */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 relative">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 px-2 rounded-full bg-teal-500/10 text-teal-400 text-[9px] font-black font-mono tracking-widest uppercase border border-teal-500/20">
              Módulo Comparativo Gis Vaca Muerta
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-orange-400 font-mono animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
              Enlace Activo
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-100 font-sans tracking-tight">
            Dashboard Integrado de Monitoreo Multi-Estación
          </h2>
          <p className="text-xs text-slate-400 leading-normal max-w-2xl mt-1">
            Plataforma de comparación simultánea de gases tóxicos y venteos continuos de la cuenca. 
            Permite medir la densidad geológica de contaminación atmosférica y territorial total.
          </p>
        </div>

        {/* View Mode Selectors */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 max-w-full overflow-x-auto self-stretch md:self-auto">
          <button
            onClick={() => setViewMode("SMALL_MULTIPLES")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all text-nowrap cursor-pointer ${
              viewMode === "SMALL_MULTIPLES"
                ? "bg-teal-500 text-slate-950 font-extrabold shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
            id="btn-view-multiples"
          >
            Gráficos Paralelos
          </button>
          <button
            onClick={() => setViewMode("CONSOLIDATED")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all text-nowrap cursor-pointer ${
              viewMode === "CONSOLIDATED"
                ? "bg-teal-500 text-slate-950 font-extrabold shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
            id="btn-view-consolidated"
          >
            Foco de Gas Individual
          </button>
          <button
            onClick={() => setViewMode("HAZARD_INDEX")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all text-nowrap cursor-pointer ${
              viewMode === "HAZARD_INDEX"
                ? "bg-teal-500 text-slate-950 font-extrabold shadow"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
            id="btn-view-hazard"
          >
            Ranking de Criticidad
          </button>
        </div>
      </div>

      {/* Main Comparative Widgets Board */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="grid gap-5"
          id="active-comparison-layout"
        >
          {/* VIEW: Small Multiples - 4 charts simultaneously */}
          {viewMode === "SMALL_MULTIPLES" && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" id="view-multi-charts">
              {renderD3BarChart("CH4")}
              {renderD3BarChart("CO2")}
              {renderD3BarChart("NO2")}
              {renderD3BarChart("SO2")}
            </div>
          )}

          {/* VIEW: Focused Single Gas comparison with detailed threshold bars */}
          {viewMode === "CONSOLIDATED" && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5" id="view-focused-gas">
              {/* Selector de Gas */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <ArrowRightLeft className="w-5 h-5 text-teal-400" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-200">
                      Comparativa Ampliada: {gasMeta[selectedGas].label}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                      Selecciona un gas para contrastar las 5 bases operacionales frente al marco legislativo provincial de Neuquén.
                    </p>
                  </div>
                </div>
                <div className="flex gap-1.5 w-full sm:w-auto">
                  {(["CH4", "CO2", "NO2", "SO2"] as const).map((key) => (
                    <button
                      key={key}
                      onClick={() => setSelectedGas(key)}
                      className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                        selectedGas === key
                          ? "bg-amber-500 text-slate-950 border border-amber-400 font-extrabold"
                          : "bg-slate-950 text-slate-400 border border-slate-900 hover:bg-slate-800"
                      }`}
                      id={`focused-gas-btn-${key}`}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Advanced D3 Bar Chart Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                <div className="lg:col-span-8">
                  {/* Detailed Bar rendering with standard coordinates */}
                  <div className="h-64 relative" id="focused-svg-canvas">
                    <svg className="w-full h-full" overflow="visible">
                      {/* Sub-grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1.0].map((perc, i) => {
                        const gasArr = hotspots.map(h => selectedGas === "CH4" ? h.ch4Value : selectedGas === "CO2" ? h.co2Value : selectedGas === "NO2" ? h.no2Value : h.so2Value);
                        const max = (d3.max(gasArr) || 1) * 1.15;
                        const tickVal = max * perc;
                        const yPos = 220 - (200 * perc);
                        return (
                          <g key={`grid-line-${i}`}>
                            <line 
                              x1="0" 
                              y1={yPos} 
                              x2="100%" 
                              y2={yPos} 
                              stroke="#1e293b" 
                              strokeWidth="1" 
                              strokeDasharray="2, 4" 
                            />
                            <text 
                              x="100%" 
                              dx="-5" 
                              y={yPos - 4} 
                              textAnchor="end" 
                              fill="#475569" 
                              fontSize="8" 
                              fontFamily="monospace"
                            >
                              {tickVal.toFixed(selectedGas === "CH4" ? 1 : 0)} {gasMeta[selectedGas].unit}
                            </text>
                          </g>
                        );
                      })}

                      {/* Threshold warning boundary */}
                      {(() => {
                        const gasArr = hotspots.map(h => selectedGas === "CH4" ? h.ch4Value : selectedGas === "CO2" ? h.co2Value : selectedGas === "NO2" ? h.no2Value : h.so2Value);
                        const maxVal = (d3.max(gasArr) || 1) * 1.15;
                        const threshold = gasMeta[selectedGas].threshold;
                        const yPos = 220 - (200 * (threshold / maxVal));
                        if (yPos >= 20 && yPos <= 220) {
                          return (
                            <g>
                              <line x1="0" y1={yPos} x2="100%" y2={yPos} stroke="#ef4444" strokeWidth="2" strokeDasharray="6 4" />
                              <rect x="10" y={yPos - 14} width="160" height="13" fill="#ef4444/20" rx="3" className="fill-red-500/10" stroke="#f87171" strokeWidth="0.5" />
                              <text x="14" y={yPos - 4} fill="#f87171" fontSize="8" fontFamily="monospace" fontWeight="bold">
                                LÍMITE RECOMENDADO ({threshold} {gasMeta[selectedGas].unit})
                              </text>
                            </g>
                          );
                        }
                      })()}

                      {/* Station Bars with labels */}
                      {hotspots.map((h, idx) => {
                        const val = selectedGas === "CH4" ? h.ch4Value : selectedGas === "CO2" ? h.co2Value : selectedGas === "NO2" ? h.no2Value : h.so2Value;
                        const gasArr = hotspots.map(h => selectedGas === "CH4" ? h.ch4Value : selectedGas === "CO2" ? h.co2Value : selectedGas === "NO2" ? h.no2Value : h.so2Value);
                        const maxVal = (d3.max(gasArr) || 1) * 1.15;
                        const barHeight = (val / maxVal) * 200;
                        const xPos = `${(idx / hotspots.length) * 100}%`;
                        const widthPerc = `${75 / hotspots.length}%`;
                        const isOver = val > gasMeta[selectedGas].threshold;
                        const isSelected = selectedStationId === h.id;

                        return (
                          <g 
                            key={`focus-bar-${h.id}`} 
                            onClick={() => onSelectStation(h)}
                            className="cursor-pointer group"
                          >
                            <rect
                              x={xPos}
                              y={220 - barHeight}
                              width={widthPerc}
                              height={barHeight}
                              className={`transition-all duration-300 ${
                                isOver 
                                  ? "fill-gradient-to-t from-red-500 to-orange-500/90 fill-red-500/80 hover:fill-red-400" 
                                  : "fill-teal-500/70 hover:fill-teal-400"
                              }`}
                              rx="5"
                              stroke={isSelected ? "#14b8a6" : isOver ? "#f87171" : "#475569"}
                              strokeWidth={isSelected ? "3" : "1"}
                            />
                            {/* Hover light highlight */}
                            <rect
                              x={xPos}
                              y={220 - barHeight}
                              width={widthPerc}
                              height={barHeight}
                              fill="#ffffff"
                              opacity="0"
                              className="group-hover:opacity-10 transition-opacity"
                              rx="5"
                            />
                            {/* Label */}
                            <text
                              x={`calc(${(idx / hotspots.length) * 100}% + ${(37.5 / hotspots.length)}%)`}
                              y={220 - barHeight - 10}
                              textAnchor="middle"
                              fill={isOver ? "#f87171" : "#06b6d4"}
                              fontSize="11"
                              fontFamily="monospace"
                              fontWeight="black"
                            >
                              {val} {gasMeta[selectedGas].unit}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>

                {/* Additional statistics sidebar card */}
                <div className="lg:col-span-4 bg-slate-950/80 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between self-stretch">
                  <div>
                    <span className="text-[9px] font-bold font-mono tracking-widest text-teal-400 uppercase">
                      INFORME COMPARATIVO ESTADÍSTICO
                    </span>
                    <h4 className="text-sm font-bold text-slate-100 font-sans mt-1">
                      {gasMeta[selectedGas].label}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                      El valor de fondo normal del aire atmosférico de pastizal en la estepa patagónica para {selectedGas} es de referencial plano. 
                      Los puntos residenciales de Añelo están expuestos a columnas de dispersión según la velocidad meteorológica actual.
                    </p>
                  </div>

                  <div className="space-y-3.5 my-4">
                    <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-900">
                      <span className="text-slate-500">Valor Máximo Registrado</span>
                      <strong className="font-mono text-red-400 font-bold">
                        {d3.max(hotspots, h => selectedGas === "CH4" ? h.ch4Value : selectedGas === "CO2" ? h.co2Value : selectedGas === "NO2" ? h.no2Value : h.so2Value)} {gasMeta[selectedGas].unit}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center text-xs py-1.5 border-b border-slate-900">
                      <span className="text-slate-500">Promedio de Cuenca</span>
                      <strong className="font-mono text-amber-500 font-bold">
                        {d3.mean(hotspots, h => selectedGas === "CH4" ? h.ch4Value : selectedGas === "CO2" ? h.co2Value : selectedGas === "NO2" ? h.no2Value : h.so2Value)?.toFixed(1)} {gasMeta[selectedGas].unit}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center text-xs py-1.5">
                      <span className="text-slate-500">Estaciones Sobre el Límite</span>
                      <strong className="font-mono text-red-500 font-bold">
                        {hotspots.filter(h => {
                          const val = selectedGas === "CH4" ? h.ch4Value : selectedGas === "CO2" ? h.co2Value : selectedGas === "NO2" ? h.no2Value : h.so2Value;
                          return val > gasMeta[selectedGas].threshold;
                        }).length} de 5
                      </strong>
                    </div>
                  </div>

                  <div className="p-3 bg-red-950/25 border border-red-900/40 rounded-xl flex gap-2 items-center">
                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                    <p className="text-[9px] text-red-300 font-sans leading-snug">
                      La exposición crónica a concentraciones elevadas atenta contra la salud respiratoria de las comunidades circundantes de Añelo y Tratayén.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: Integrated Health Hazard Score ranking with interactive list */}
          {viewMode === "HAZARD_INDEX" && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5" id="view-hazard-index">
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-200">
                    Ranking de Severidad / Índice de Riesgo HSE Combinado
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-none">
                    Un modelo unificado que pondera la concentración de gases (CH4, CO2, NO2, SO2) y el área total afectada en m².
                  </p>
                </div>
                <div className="text-right text-[10px] text-slate-400 font-mono">
                  Escala de Riesgo: <span className="text-red-400 font-bold font-mono">0 - 100 PTS</span>
                </div>
              </div>

              {/* Grid with ranking list and interactive detail panel */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left side: Ranked elements */}
                <div className="lg:col-span-7 space-y-3">
                  {[...hotspots]
                    .map(h => ({ hotspot: h, score: calculateHazardScore(h) }))
                    .sort((a, b) => b.score - a.score)
                    .map((item, index) => {
                      const h = item.hotspot;
                      const cat = getHazardCategory(item.score);
                      const isSelected = selectedStationId === h.id;

                      return (
                        <div
                          key={`rank-${h.id}`}
                          onClick={() => onSelectStation(h)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                            isSelected 
                              ? "bg-slate-950 border-teal-500 shadow-md shadow-teal-950" 
                              : "bg-slate-950/40 border-slate-850 hover:bg-slate-950 hover:border-slate-800"
                          }`}
                          id={`risk-rank-${h.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Position Badge */}
                            <span className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center font-mono text-xs font-bold shrink-0">
                              #{index + 1}
                            </span>
                            <div className="min-w-0">
                              <h4 className="text-xs font-black text-slate-200 truncate">
                                {h.name.split(" - ")[1] || h.name}
                              </h4>
                              <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1 leading-none mt-0.5">
                                {h.locationName}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            {/* Progress Indicator */}
                            <div className="hidden sm:block w-20 bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
                              <div className={`h-full ${cat.bar}`} style={{ width: `${item.score}%` }}></div>
                            </div>

                            {/* Classification tag */}
                            <span className={`text-[9px] font-bold font-mono py-0.5 px-2 rounded-full border ${cat.color} ${cat.border}`}>
                              {cat.label} ({item.score} pts)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Right side: Summary indicators */}
                <div className="lg:col-span-5 bg-slate-950/70 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between">
                  <div>
                    <span className="text-[9px] font-bold font-mono tracking-widest text-teal-400 uppercase">
                      CÁLCULO EXHAUSTIVO DE AMENAZA
                    </span>
                    <h4 className="text-sm font-bold text-slate-150 font-sans mt-1">
                      Metodología de Ponderación HSE
                    </h4>
                    <p className="text-[11.5px] text-slate-400 mt-2 leading-relaxed">
                      El indicador unifica la huella ecológica terrestre con la dispersión satelital aérea. Las zonas con puntaje superior a 50 implican medidas de contingencia en suelo de carácter inmediato.
                    </p>

                    <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3.5 my-4">
                      <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-950 mb-2">
                        <span className="text-slate-500">Puntaje Máximo de Cuenca</span>
                        <strong className="text-red-500 font-mono font-black text-sm">
                          {Math.max(...hotspots.map(h => calculateHazardScore(h)))} PTS
                        </strong>
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono leading-snug">
                        Fórmula de matriz provincial: <br />
                        <code className="text-teal-400 bg-slate-950 p-1 rounded block mt-1 overflow-x-auto text-center font-bold">
                          Risk = [3.0*CH4 + 1.5*CO2 + 2.0*NO2 + 1.5*SO2 + 2.0*√Area] / 10
                        </code>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-teal-950/25 border border-teal-900/40 rounded-xl text-teal-300 text-[10px] leading-relaxed flex gap-2">
                    <Award className="w-5 h-5 text-teal-400 shrink-0" />
                    <span>
                      La cuenca entera tiene una calificación promedio de <b>{d3.mean(hotspots, h => calculateHazardScore(h))?.toFixed(1)} PTS</b>, categorizado como de <b>Riesgo Alto</b>, debido a la expansión acumulativa de residuos oleosos en Bandurria Sur.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* FOOTER: Live Telemetry simulator showing active real-time data feeds of the virtual twin */}
      <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-orange-500/10 p-1.5 border border-orange-500/20 shadow">
            <Radio className={`w-4 h-4 text-orange-400 ${isSimulating ? "animate-pulse" : ""}`} />
          </div>
          <div>
            <div className="flex gap-2 items-center">
              <h4 className="text-[11px] font-black font-mono tracking-wider text-slate-200">
                MONITOR DE SENSORES EN TIEMPO REAL (VIRTUAL TWIN)
              </h4>
              <span className="text-[9px] bg-emerald-500/10 text-emerald-400 font-mono px-1.5 py-0.2 rounded font-bold">
                CAMS CALIBRATOR ACTIVE
              </span>
            </div>
            <p className="text-[10px] text-slate-450 mt-0.5">
              Fluctuaciones dinámicas reportadas en órbita actual. Se actualiza cada 3 segundos automáticamente.
            </p>
          </div>
        </div>

        {/* Live values ribbon */}
        <div className="flex gap-3 max-w-full overflow-x-auto pb-1 md:pb-0 shrink-0">
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className={`px-3 py-1 rounded text-[9px] font-bold font-mono transition-all cursor-pointer ${
              isSimulating 
                ? "bg-orange-500 hover:bg-orange-400 text-slate-950 font-extrabold" 
                : "bg-slate-800 text-slate-400 border border-slate-700"
            }`}
            id="toggle-telemetry"
          >
            {isSimulating ? "Pausar Sensor" : "Iniciar Telemetría"}
          </button>
          
          <div className="flex gap-3 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-[10px] font-mono">
            {hotspots.slice(0, 3).map(h => {
              const live = liveTelemetry[h.id];
              const nameLetter = h.id === "loma_campana" ? "Loma" : h.id === "bandurria_sur" ? "Bandurria" : "Pichana";
              return (
                <div key={`tele-${h.id}`} className="flex items-center gap-1.5 py-0.2 select-none border-r border-slate-810 pr-3 last:border-r-0 last:pr-0 shrink-0">
                  <span className="text-slate-400 font-mono font-bold">{nameLetter}:</span>
                  <span className="text-teal-400 font-black">{live?.ch4 || h.ch4Value} CH4</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-amber-500 font-bold">{live?.co2 || h.co2Value} CO2</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
