import React from "react";
import { Hotspot } from "../types";

interface GaseousAtmosphereWidgetProps {
  hotspot: Hotspot;
}

export default function GaseousAtmosphereWidget({ hotspot }: GaseousAtmosphereWidgetProps) {
  // Analytical gas safety guidelines in the oil & gas industry
  const gases = [
    {
      label: "Metano (CH₄)",
      value: hotspot.ch4Value,
      unit: "ppm",
      normal: "< 2.0 ppm",
      warn: 2.5,
      crit: 5.0,
      description: "Gas de potente efecto invernadero. Alertas en venteos o campanas de fractura.",
    },
    {
      label: "Dióxido de Carbono (CO₂)",
      value: hotspot.co2Value,
      unit: "ppm",
      normal: "< 420 ppm",
      warn: 460,
      crit: 520,
      description: "Emisiones de antorcha o generadores industriales locales.",
    },
    {
      label: "Dióxido de Nitrógeno (NO₂)",
      value: hotspot.no2Value,
      unit: "ppb",
      normal: "< 30 ppb",
      warn: 45,
      crit: 65,
      description: "Indicador de combustión térmica de alta temperatura de flaring.",
    },
    {
      label: "Dióxido de Azufre (SO₂)",
      value: hotspot.so2Value,
      unit: "ppb",
      normal: "< 20 ppb",
      warn: 30,
      crit: 45,
      description: "Subproducto gaseoso asociado a crudos ácidos o lodos con sulfitos.",
    }
  ];

  const getStatusColor = (val: number, warn: number, crit: number) => {
    if (val >= crit) return { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", pct: "bg-red-500", status: "Crítico" };
    if (val >= warn) return { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", pct: "bg-amber-500", status: "Anómalo" };
    return { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20", pct: "bg-emerald-500", status: "Fondo Normal" };
  };

  return (
    <div id="cams-gaseous-atmosphere-widget" className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h4 className="text-xs font-semibold text-sky-400 tracking-wider uppercase font-mono">
            Monitoreo CAMS (Copernicus Atmosphere)
          </h4>
          <h3 className="text-base font-bold text-slate-100 font-sans mt-0.5">
            Concentración de Gases de Efecto Invernadero
          </h3>
        </div>
        <span className="text-[10px] text-slate-400 font-mono bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md">
          Estación: Teledetección VM-CAMS
        </span>
      </div>

      <p className="text-xs text-slate-300 leading-relaxed mb-5">
        Lecturas integrales de columna atmosférica satelital para el yacimiento <span className="font-semibold text-slate-100">{hotspot.locationName}</span>. Estas mediciones identifican pérdidas fugitivas o flaring ineficiente.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {gases.map((gas, index) => {
          const conf = getStatusColor(gas.value, gas.warn, gas.crit);
          // Calculate arbitrary percentage width for the progress bar (max range capped for display)
          const maxScale = gas.crit * 2;
          const displayPct = Math.min((gas.value / maxScale) * 100, 100);

          return (
            <div 
              key={index} 
              className={`p-4 rounded-xl border ${conf.bg} ${conf.border} flex flex-col justify-between`}
              id={`gas-card-${index}`}
            >
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-xs font-semibold text-slate-400 font-sans">{gas.label}</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-mono uppercase ${conf.text} bg-slate-950/50`}>
                    {conf.status}
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mt-2 mb-1">
                  <span className="text-2xl font-black text-slate-50 font-mono tracking-tight">{gas.value}</span>
                  <span className="text-xs text-slate-450 font-mono">{gas.unit}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-normal mb-3">
                  {gas.description}
                </p>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-800/40">
                <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${conf.pct} transition-all duration-700`}
                    style={{ width: `${displayPct}%` }}
                  ></div>
                </div>
                <div className="flex justify-between items-center text-[9px] font-mono mt-1 text-slate-500">
                  <span>Normal: {gas.normal}</span>
                  <span>Max Escala: {maxScale} {gas.unit}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
