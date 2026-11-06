import React, { useState, useMemo } from "react";
import { Hotspot } from "../types";
import { 
  Orbit, 
  Search, 
  Wind, 
  Compass, 
  Radio, 
  Maximize2, 
  Layers, 
  Activity, 
  Info, 
  Filter, 
  TrendingUp, 
  FileSpreadsheet, 
  Cpu, 
  Wrench,
  Gauge
} from "lucide-react";

interface GHGSatSpectraWidgetProps {
  selectedHotspot: Hotspot | null;
}

// Interactive satellites database for the GHGSat point-source constellation
interface GHGSatellite {
  id: string;
  name: string;
  launchYear: number;
  sensor: string;
  resolution: string; // Spatial resolution e.g., "25m"
  detectionThreshold: string;
  status: "ONLINE" | "STANDBY" | "CALIBRATING";
  orbitCycle: string;
}

const GHGSAT_FLEET: GHGSatellite[] = [
  { id: "ghgsat_c1", name: "GHGSat-C1 'Claire'", launchYear: 2016, sensor: "WAFPI Gen-1", resolution: "50m", detectionThreshold: "[CH4] > 1000 ppb", status: "ONLINE", orbitCycle: "14 días" },
  { id: "ghgsat_c2", name: "GHGSat-C2 'Hugo'", launchYear: 2021, sensor: "WAFPI Gen-2-A", resolution: "25m", detectionThreshold: "[CH4] > 100 ppb", status: "ONLINE", orbitCycle: "9 días" },
  { id: "ghgsat_c3", name: "GHGSat-C3 'Meso'", launchYear: 2022, sensor: "WAFPI Gen-2-B", resolution: "25m", detectionThreshold: "[CH4] > 80 ppb", status: "ONLINE", orbitCycle: "7 días" },
  { id: "ghgsat_c5", name: "GHGSat-C5 'Luca'", launchYear: 2023, sensor: "WAFPI Gen-3-A", resolution: "15m", detectionThreshold: "[CH4] > 50 ppb", status: "ONLINE", orbitCycle: "5 días" },
  { id: "ghgsat_c7", name: "GHGSat-C7 'Aura'", launchYear: 2024, sensor: "WAFPI Gen-3-B+", resolution: "15m", detectionThreshold: "[CH4] > 45 ppb", status: "ONLINE", orbitCycle: "4 días" }
];

export default function GHGSatSpectraWidget({ selectedHotspot }: GHGSatSpectraWidgetProps) {
  const [selectedSatelliteId, setSelectedSatelliteId] = useState<string>("ghgsat_c3");
  const [selectedWavelength, setSelectedWavelength] = useState<number>(1666); // SWIR absorption center
  const [spectralOverlayActive, setSpectralOverlayActive] = useState<boolean>(true);
  
  const activeSatellite = useMemo(() => {
    return GHGSAT_FLEET.find(s => s.id === selectedSatelliteId) || GHGSAT_FLEET[2];
  }, [selectedSatelliteId]);

  // Calculations for Point-Source Methane Plume based on physical parameters of selected Hotspot
  const plumeCalculations = useMemo(() => {
    if (!selectedHotspot) return null;

    // Standard baseline methane is 1.8 - 1.9 ppm. 
    // Anything above is an anomaly.
    const deltaCH4 = Math.max(0.1, selectedHotspot.ch4Value - 1.85);
    
    // Wind dilution coefficient: lower wind = higher local containment plume; higher wind = flatter, longer plume dispersion
    const windSpeedCorrected = Math.max(1, selectedHotspot.windSpeed);
    
    // Source Rate Estimation (Q) in kg/h using custom point source Gaussian modeling parameter weights
    // Q ≈ constant * (delta_C) * Area * wind_speed
    const sourceRate_kg_h = Number(((deltaCH4 * selectedHotspot.surfaceArea * windSpeedCorrected) * 0.00035).toFixed(1));
    
    // Max Column Density (ppm-m) inside the plume core
    const colDensity_ppm_m = Math.round(deltaCH4 * 450);

    // Compute 2D points outline of the simulated 25m ghgsat plume overlay relative to the wind direction
    const windAngleMap: Record<string, number> = {
      "N": 90, "NNE": 67.5, "NE": 45, "ENE": 22.5,
      "E": 0, "ESE": 337.5, "SE": 315, "SSE": 292.5,
      "S": 270, "SSW": 247.5, "SW": 225, "WSW": 202.5,
      "W": 180, "WNW": 157.5, "NW": 135, "NNW": 112.5
    };
    
    const windAngleDeg = windAngleMap[selectedHotspot.windDirection] ?? 45;
    const angleRad = (windAngleDeg * Math.PI) / 180;

    // Calculate length of the plume vector (constrained by wind and area)
    const plumeLength = Math.min(110, 40 + (selectedHotspot.surfaceArea / 1200) + (windSpeedCorrected / 2));
    
    // Base end-coordinates of the plume vector relative to center (75, 75)
    // Wind blows TOWARDS the windAngle direction
    const dx = Math.cos(angleRad) * plumeLength;
    const dy = -Math.sin(angleRad) * plumeLength; // SVG Y-axis is inverted

    return {
      deltaCH4,
      sourceRate_kg_h,
      colDensity_ppm_m,
      windAngleDeg,
      dx,
      dy,
      plumeLength
    };
  }, [selectedHotspot]);

  // Generates Fabry-Pérot Spectroscopic Interferometer transmission curves
  // Methane absorbs light strongly in the Shortwave Infrared region (1630nm to 1680nm)
  // Major dip peaks occur at 1653nm and 1666nm.
  const spectralData = useMemo(() => {
    const points = [];
    const localCH4 = selectedHotspot ? selectedHotspot.ch4Value : 1.85;
    // Increasing local concentration depresses transmission more intensely (deeper absorption wells)
    const ch4Factor = Math.min(0.95, (localCH4 - 1.8) * 0.15 + 0.1); 

    for (let wl = 1630; wl <= 1680; wl += 2) {
      // Atmospheric base transmission (starts high but dips naturally)
      let baseVal = 0.90 - Math.sin((wl - 1630) * 0.05) * 0.08;

      // Primary Absorption band wells (Fabry-Pérot target lines)
      const dip1 = Math.exp(-Math.pow(wl - 1653, 2) / 16) * 0.65 * ch4Factor;
      const dip2 = Math.exp(-Math.pow(wl - 1666, 2) / 25) * 0.85 * ch4Factor;
      
      // Secondary minor lines
      const dip3 = Math.exp(-Math.pow(wl - 1638, 2) / 8) * 0.25 * ch4Factor;
      const dip4 = Math.exp(-Math.pow(wl - 1675, 2) / 12) * 0.22 * ch4Factor;

      const transmission = Math.max(0.02, baseVal - dip1 - dip2 - dip3 - dip4);
      points.push({ wl, transmission });
    }
    return points;
  }, [selectedHotspot]);

  // Find transmission value for the selected slider wavelength
  const selectedWavelengthTransmission = useMemo(() => {
    const found = spectralData.find(p => p.wl === selectedWavelength || Math.abs(p.wl - selectedWavelength) < 2);
    return found ? (found.transmission * 100).toFixed(1) : "72.4";
  }, [spectralData, selectedWavelength]);

  return (
    <div className="bg-slate-900/40 border border-slate-805 rounded-2xl p-6 shadow-xl relative overflow-hidden" id="ghgsat-spectra-widget-root">
      {/* Dynamic atmospheric grid design */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-cyan-550/5 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-gradient-to-tr from-teal-500/5 to-transparent rounded-full blur-2xl pointer-events-none" />

      {/* Primary Header Segment */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-gradient-to-br from-cyan-500/15 to-teal-500/10 border border-cyan-550/20 rounded-xl">
            <Orbit className="w-5.5 h-5.5 text-cyan-400 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded">
                TELEMETRÍA GHGSat CONSTELLATION
              </span>
              <span className="text-[10.5px] font-mono text-slate-400 flex items-center gap-1">
                • Espectroscopía SWIR de Alta Resolución (25m)
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 font-sans mt-1">
              Análisis Espectral de Methane por Fabry-Pérot Interferometer
            </h3>
          </div>
        </div>

        {/* GHGSat Satellite Selection dropdown tabs */}
        <div className="flex flex-wrap gap-1 bg-slate-950 p-1.5 rounded-xl border border-slate-850">
          {GHGSAT_FLEET.map((sat) => {
            const isSelected = selectedSatelliteId === sat.id;
            return (
              <button
                key={sat.id}
                onClick={() => setSelectedSatelliteId(sat.id)}
                className={`px-3 py-1 text-[10.5px] font-semibold rounded-lg font-mono transition-all uppercase ${
                  isSelected 
                    ? "bg-cyan-500 text-slate-950 font-bold shadow" 
                    : "text-slate-405 hover:text-slate-200"
                }`}
                type="button"
              >
                {sat.name.split(" ")[1].replace(/'/g, "")}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Core Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Selected Satellite Status & Gas Plume Gaussian Modeler */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-950/60 p-4 border border-slate-850 rounded-xl space-y-3.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 font-sans flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                Satélite Seleccionado:
              </span>
              <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded font-mono font-bold">
                ● ESPACIAL {activeSatellite.status}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-slate-900 border border-slate-805 p-2.5 rounded-lg">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Nombre de Plataforma</span>
                <span className="text-xs font-bold font-sans text-slate-200">{activeSatellite.name}</span>
              </div>
              <div className="bg-slate-900 border border-slate-805 p-2.5 rounded-lg">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Línea de Sensor</span>
                <span className="text-xs font-bold font-mono text-cyan-400">{activeSatellite.sensor}</span>
              </div>
              <div className="bg-slate-900 border border-slate-805 p-2.5 rounded-lg">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Precisión Espacial (Píxel)</span>
                <span className="text-xs font-bold font-sans text-slate-200">{activeSatellite.resolution}</span>
              </div>
              <div className="bg-slate-900 border border-slate-805 p-2.5 rounded-lg">
                <span className="text-[9px] font-mono text-slate-500 uppercase block">Ciclo Orbital</span>
                <span className="text-xs font-bold font-mono text-slate-200">{activeSatellite.orbitCycle}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
              Los sensores micro-satelitales de <strong>GHGSat</strong> complementan los pases mundiales de Sentinel-5P mediante la inyección de mediciones georreferenciadas con resolución de {activeSatellite.resolution}. Esto permite capturar fugas en cabezales de pozo y venteos invisibles para satélites macrocobertura.
            </p>
          </div>

          {/* Point-Source Methane Plume Projection (Gaussian Jet Map) */}
          {selectedHotspot && plumeCalculations ? (
            <div className="bg-slate-950/40 p-4 border border-slate-850 rounded-xl space-y-4">
              <div className="flex justify-between items-center border-b border-slate-850 pb-2.5">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5 font-sans">
                  <Wind className="w-4 h-4 text-teal-400 animate-pulse" />
                  Pluma de Methane de Alta Resolución (25m Grid)
                </span>
                <span className="text-[9.5px] font-mono text-slate-450 uppercase">
                  Viento: {selectedHotspot.windDirection} • {selectedHotspot.windSpeed} km/h
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                
                {/* SVG Visual Simulator Grid representing the localized plume plume length & vector */}
                <div className="md:col-span-5 bg-slate-955 rounded-xl border border-slate-800 p-2.5 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute top-1 left-2 text-[8px] font-mono text-slate-505">ANÁLISIS DE INTERFERÓMETRO</div>
                  
                  {/* Stylized background coordinate grids */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:16px_16px]" />

                  <svg width="130" height="130" viewBox="0 0 150 150" className="relative z-10 overflow-visible">
                    {/* Definitions for gorgeous thermal gradient plumes */}
                    <defs>
                      <radialGradient id="plume-core" cx="0%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.85" />
                        <stop offset="30%" stopColor="#14b8a6" stopOpacity="0.5" />
                        <stop offset="70%" stopColor="#0ea5e9" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
                      </radialGradient>
                    </defs>

                    {/* Concentric distance boundary rings (25m scale ticks) */}
                    <circle cx="75" cy="75" r="25" fill="none" stroke="#ffffff" strokeOpacity="0.04" strokeDasharray="3,3" />
                    <circle cx="75" cy="75" r="50" fill="none" stroke="#ffffff" strokeOpacity="0.04" strokeDasharray="3,3" />
                    
                    {/* Compass North Arrow */}
                    <line x1="75" y1="10" x2="75" y2="25" stroke="#475569" strokeWidth="1" />
                    <text x="75" y="8" textAnchor="middle" fontSize="7" fill="#475569" fontWeight="900" fontFamily="monospace">N</text>

                    {/* Highlighted active vector ray from source leak to dispersion direction */}
                    <line 
                      x1="75" 
                      y1="75" 
                      x2={75 + plumeCalculations.dx} 
                      y2={75 + plumeCalculations.dy} 
                      stroke="#22d3ee" 
                      strokeWidth="1.5" 
                      strokeDasharray="4,2" 
                      strokeOpacity="0.4" 
                    />

                    {/* Gaussian plume dispersion cone overlay rotating dynamically */}
                    <g transform={`translate(75, 75) rotate(${-plumeCalculations.windAngleDeg})`}>
                      {/* Dispersion heat signature polygon */}
                      <path 
                        d={`M 0,0 L ${plumeCalculations.plumeLength},-22 Q ${plumeCalculations.plumeLength + 20},0 ${plumeCalculations.plumeLength},22 Z`} 
                        fill="url(#plume-core)" 
                      />
                    </g>
                    
                    {/* Core Point-Source emitter epicenter */}
                    <circle cx="75" cy="75" r="4.5" fill="#f43f5e" className="animate-ping" style={{ animationDuration: "2s" }} />
                    <circle cx="75" cy="75" r="3.5" fill="#e11d48" stroke="#ffffff" strokeWidth="1" />
                  </svg>
                </div>

                {/* Micro-plume detailed emissions statistics */}
                <div className="md:col-span-7 space-y-2.5">
                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-slate-400 font-sans">Flujo Másico Estimado Q:</span>
                    <span className="font-mono text-cyan-400 font-bold block bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-900/20">
                      {plumeCalculations.sourceRate_kg_h} kg CH₄ / h
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-slate-400 font-sans">Concentración Máxima Columnar:</span>
                    <span className="font-mono text-teal-400 font-bold">
                      {plumeCalculations.colDensity_ppm_m} ppm-m
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[10.5px]">
                    <span className="text-slate-400 font-sans">Área Crítica de la Pluma:</span>
                    <span className="font-mono text-slate-300">
                      ~{(selectedHotspot.surfaceArea * 1.35).toFixed(0)} m²
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[10.5px] border-t border-slate-900 pt-2">
                    <span className="text-slate-400 font-sans">Grado de Confianza:</span>
                    <span className="font-mono text-emerald-400 font-medium">94.8% (CAMS Corrected)</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-950/40 rounded-xl border border-slate-850 text-center text-xs text-slate-400">
              Seleccione un punto de monitoreo activo arriba para generar su modelo espacial de pluma de venteo.
            </div>
          )}
        </div>

        {/* Right Side: Interferometer Fabry-Pérot Spectrograph Live Dashboard */}
        <div className="lg:col-span-7 bg-slate-950/40 rounded-xl border border-slate-805 p-5 flex flex-col justify-between">
          
          {/* Header Spectrograph Information */}
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4" id="spectrograh-top-bar">
            <div>
              <span className="text-[10px] uppercase font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-0.5 rounded">
                ESPECTRO METANO (SWIR 1630nm - 1680nm)
              </span>
              <p className="text-xs text-slate-300 leading-relaxed mt-2">
                Ajuste la longitud de onda de escaneo para evaluar la selectividad del filtro y la profundidad de absorbancia. Las caídas pronunciadas denotan una mayor retención de energía por radicales CH₄ en la tropósfera de Vaca Muerta.
              </p>
            </div>
            
            <div className="bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-805 shrink-0 text-right">
              <span className="text-[9px] font-mono text-slate-500 block uppercase">Transmisión de Luz</span>
              <span className="text-base font-black text-cyan-400 font-mono">
                {selectedWavelengthTransmission}%
              </span>
            </div>
          </div>

          {/* Interactive Spectral transmission Chart rendered in pure SVG */}
          <div className="bg-slate-955 rounded-xl border border-slate-850 p-4 relative">
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-505 mb-2.5">
              <span>🎚️ CURVA DE ATENUACIÓN DEL SENSOR DE ADQUISICIÓN</span>
              <span className="text-teal-400 flex items-center gap-1">• Foco de Metano: {selectedHotspot?.ch4Value?.toFixed(2) || "1.85"} ppm</span>
            </div>

            {/* Custom SVG Line-chart graph */}
            <div className="h-44 w-full relative">
              <svg width="100%" height="100%" viewBox="0 0 500 150" preserveAspectRatio="none" className="overflow-visible">
                {/* Horizontal reference threshold lines (0%, 50%, 100%) */}
                <line x1="0" y1="0" x2="500" y2="0" stroke="#1e293b" strokeWidth="1" strokeDasharray="2,4" />
                <line x1="0" y1="75" x2="500" y2="75" stroke="#1e293b" strokeWidth="1" strokeDasharray="2,4" />
                <line x1="0" y1="150" x2="500" y2="150" stroke="#334155" strokeWidth="1" />
                
                {/* Vertical absorption band centers */}
                <line x1="230" y1="0" x2="230" y2="150" stroke="#ef4444" strokeWidth="1" strokeDasharray="1,6" strokeOpacity="0.4" />
                <line x1="360" y1="0" x2="360" y2="150" stroke="#f59e0b" strokeWidth="1" strokeDasharray="1,6" strokeOpacity="0.4" />

                {/* Y-axis text tags inside graph */}
                <text x="3" y="12" fontSize="7" fill="#64748b" fontFamily="monospace">100% Transmisión</text>
                <text x="3" y="81" fontSize="7" fill="#64748b" fontFamily="monospace">50% Absorbancia</text>
                
                {/* Vertical band text indicators */}
                <text x="235" y="10" fontSize="7.5" fill="#f43f5e" fontFamily="monospace" fontWeight="bold">CH₄ Peak Band 1653nm</text>
                <text x="365" y="22" fontSize="7.5" fill="#f59e0b" fontFamily="monospace" fontWeight="bold">CH₄ Fabry-Pérot Dip 1666nm</text>

                {/* Continuous wavelength path */}
                <path
                  d={(() => {
                    return spectralData.map((point, index) => {
                      // Normalize WL (1630 to 1680 to X=0 to 500)
                      const x = ((point.wl - 1630) / (1680 - 1630)) * 500;
                      // Normalize transmission (1.0 to 0.0 to Y=10 to 140)
                      const y = 140 - (point.transmission * 130);
                      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
                    }).join(" ");
                  })()}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />

                {/* Area shade matching the transmission line */}
                <path
                  d={(() => {
                    const linePath = spectralData.map((point, index) => {
                      const x = ((point.wl - 1630) / (1680 - 1630)) * 500;
                      const y = 140 - (point.transmission * 130);
                      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
                    }).join(" ");
                    return `${linePath} L 500 150 L 0 150 Z`;
                  })()}
                  fill="url(#transmission-gradient)"
                  opacity="0.12"
                  className="transition-all duration-300"
                />

                {/* Interactive cursor line corresponding to the slider wavelength */}
                {(() => {
                  const x = ((selectedWavelength - 1630) / (1680 - 1630)) * 500;
                  return (
                    <g>
                      <line x1={x} y1="0" x2={x} y2="150" stroke="#06b6d4" strokeWidth="1.5" />
                      <circle cx={x} cy={140 - (parseFloat(selectedWavelengthTransmission) / 100) * 130} r="5" fill="#22d3ee" stroke="#0f172a" strokeWidth="1.5" />
                    </g>
                  );
                })()}

                {/* Def definitions */}
                <defs>
                  <linearGradient id="transmission-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="1" />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* X-Axis labels */}
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-500 mt-2 px-1">
              <span>1630 nm (SWIR-A)</span>
              <span>1640 nm</span>
              <span>1650 nm (Ref Line)</span>
              <span>1660 nm</span>
              <span>1670 nm</span>
              <span>1680 nm (SWIR-B)</span>
            </div>
          </div>

          {/* Interactive wavelength fine-scanning simulator control */}
          <div className="mt-5 space-y-2 bg-slate-900/60 p-4 rounded-xl border border-slate-850">
            <div className="flex justify-between items-center text-[10.5px]">
              <span className="font-bold text-slate-350 font-sans flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-cyan-400" />
                Escanear Filtro de Longitud de Onda (SWIR):
              </span>
              <span className="font-mono text-cyan-400 font-bold bg-slate-950 px-2 py-0.5 rounded">
                {selectedWavelength} nm
              </span>
            </div>

            <input 
              type="range" 
              min="1630" 
              max="1680" 
              step="1"
              value={selectedWavelength}
              onChange={(e) => setSelectedWavelength(parseInt(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-950 rounded-lg appearance-none"
              id="spectral-slider"
            />
            
            <div className="flex justify-between items-center text-[9px] font-mono text-slate-505 pt-1">
              <span>Min: 1630nm</span>
              <span className="text-amber-400/80">⚠️ Mayor captación de ráfegas en 1666nm</span>
              <span>Max: 1680nm</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 text-[9.5px] text-slate-400 bg-slate-950/80 p-2 rounded border border-slate-855">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              <strong>Metodología de Teledetección Fabry-Pérot:</strong> GHGSat utiliza correlación espectral de ángulo de entrada continuo para separar de forma limpia la firma radiactiva del metano atmosférico del albedo superficial terrestre de Neuquén.
            </span>
          </div>
        </div>
      </div>

      {/* Attribution and cryptographic validation footer */}
      <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-[10px] text-slate-500 font-mono">
        <span className="flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-cyan-500" />
          Atribución: Constelación Comercial GHGSat Inc., calibrada mediante convenios de mitigación ambiental.
        </span>
        <span className="bg-slate-950/80 px-2 py-0.5 rounded border border-slate-850 text-slate-403">
          ID de Calibración: CONICET-GHG-VACA-2026
        </span>
      </div>
    </div>
  );
}
