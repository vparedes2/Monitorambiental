import React, { useState, useEffect } from "react";
import { Hotspot } from "../types";
import { SATELLITE_IMAGES } from "../presets";
import { ShieldCheck, CloudLightning, Landmark, Compass, Upload, Image, HelpCircle } from "lucide-react";

interface IncidentFormProps {
  selectedHotspot: Hotspot | null;
  onRunAnalysis: (data: any) => void;
  loading: boolean;
}

export default function IncidentForm({ selectedHotspot, onRunAnalysis, loading }: IncidentFormProps) {
  // Sync state values on selected hotspot updates
  const [lat, setLat] = useState(-38.252);
  const [lon, setLon] = useState(-68.643);
  const [type, setType] = useState<any>("Acumulación de lodos");
  const [windSpeed, setWindSpeed] = useState(45);
  const [windDirection, setWindDirection] = useState("SW");
  const [ch4, setCh4] = useState(3.2);
  const [co2, setCO2] = useState(460);
  const [no2, setNO2] = useState(28);
  const [so2, setSO2] = useState(12);
  const [surface, setSurface] = useState(3200);
  const [desc, setDesc] = useState("");
  const [imagePayload, setImagePayload] = useState<string>("");

  // UI state to toggle advanced expert configuration parameters
  const [showExpert, setShowExpert] = useState(false);

  useEffect(() => {
    if (selectedHotspot) {
      setLat(selectedHotspot.latitude);
      setLon(selectedHotspot.longitude);
      setType(selectedHotspot.type);
      setWindSpeed(selectedHotspot.windSpeed);
      setWindDirection(selectedHotspot.windDirection);
      setCh4(selectedHotspot.ch4Value);
      setCO2(selectedHotspot.co2Value);
      setNO2(selectedHotspot.no2Value);
      setSO2(selectedHotspot.so2Value);
      setSurface(selectedHotspot.surfaceArea);
      setDesc(selectedHotspot.description);
      setImagePayload(selectedHotspot.imageUrl);
    }
  }, [selectedHotspot]);

  // Convert uploaded files to base64 images to send to the backend
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePayload(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePresetImageSelect = (key: keyof typeof SATELLITE_IMAGES) => {
    setImagePayload(SATELLITE_IMAGES[key]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onRunAnalysis({
      latitude: lat,
      longitude: lon,
      windSpeed: Number(windSpeed),
      windDirection,
      ch4Value: Number(ch4),
      co2Value: Number(co2),
      no2Value: Number(no2),
      so2Value: Number(so2),
      surfaceArea: Number(surface),
      type,
      description: desc,
      image: imagePayload
    });
  };

  return (
    <form 
      onSubmit={handleSubmit} 
      className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-5"
      id="incident-sensor-form"
    >
      <div className="border-b border-slate-800/80 pb-3 flex justify-between items-center gap-2">
        <div>
          <h3 className="text-xs font-semibold text-teal-400 tracking-wider uppercase font-mono">
            {showExpert ? "Parametrización Experta" : "Muestra de Foco Activo"}
          </h3>
          <h2 className="text-base font-bold text-slate-100 font-sans mt-0.5">
            {showExpert ? "Configuración de Telemetría" : "Problema Detectado en Campo"}
          </h2>
        </div>
        
        {/* Toggle option for Expert Parametrization */}
        <button
          type="button"
          onClick={() => setShowExpert(!showExpert)}
          className={`px-3 py-1.5 rounded-lg text-[9px] font-mono uppercase font-bold transition-colors border shrink-0 ${
            showExpert 
              ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-md" 
              : "bg-slate-950 hover:bg-slate-900 border-slate-850 text-slate-400 hover:text-slate-200"
          }`}
          id="btn-toggle-expert-view"
        >
          {showExpert ? "Ocultar Parámetros" : "Ajustes Expertos ()"}
        </button>
      </div>

      {!showExpert ? (
        /* Simplified high-fidelity sample of the detected incident */
        <div className="space-y-4" id="simplified-hotspot-preview-card">
          <div className="bg-gradient-to-br from-slate-950 to-slate-900/80 border border-slate-850 p-4 rounded-xl space-y-3.5 relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-10 ${
              selectedHotspot?.status === "Crítico" ? "bg-red-500 animate-pulse" : "bg-amber-500"
            }`}></div>
            
            <div className="flex justify-between items-start relative">
              <div>
                <span className={`text-[9px] font-black tracking-wider uppercase px-2 py-0.5 rounded font-mono ${
                  selectedHotspot?.status === "Crítico"
                    ? "bg-red-950/80 text-red-400 border border-red-900/40"
                    : "bg-amber-950/80 text-amber-500 border border-amber-900/40"
                }`}>
                  Foco Regulado: {selectedHotspot?.status || "Crítico"}
                </span>
                <h3 className="text-sm font-black text-slate-100 font-sans mt-2">
                  {selectedHotspot?.name || "Loma Campana - Sector Manual"}
                </h3>
                <p className="text-[10.5px] text-slate-400 font-mono mt-0.5 leading-tight flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  {selectedHotspot?.locationName || "Cuenca Neuquina"}
                </p>
              </div>

              {selectedHotspot?.imageUrl && (
                <div className="w-11 h-11 rounded-lg border border-slate-800 overflow-hidden bg-slate-950 shrink-0">
                  <img 
                    src={selectedHotspot.imageUrl} 
                    alt="Imagen de Teledetección" 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-900/80">
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-900">
                <span className="text-[8.5px] font-bold text-slate-500 block font-mono">Coordenadas WGS84</span>
                <span className="text-xs font-mono font-bold text-teal-400 block mt-0.5">
                  {lat.toFixed(5)}° S, {lon.toFixed(5)}° O
                </span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-900">
                <span className="text-[8.5px] font-bold text-slate-500 block font-mono">Superficie afectada</span>
                <span className="text-xs font-mono font-extrabold text-orange-400 block mt-0.5">
                  {surface.toLocaleString("es-AR")} m²
                </span>
              </div>
            </div>

            <div className="p-3 bg-slate-950/90 border border-slate-850 rounded-xl space-y-1">
              <span className="text-[8px] font-black font-mono tracking-wider text-slate-500 uppercase block">Categoría de Incidente</span>
              <h4 className="text-xs font-extrabold text-teal-400">
                {type}
              </h4>
              <p className="text-[11px] text-slate-300 leading-relaxed italic border-l-2 border-teal-500/30 pl-2 mt-1">
                {desc || "Sin observaciones adicionales reportadas en este foco."}
              </p>
            </div>
          </div>

          {/* Simple Atmospheric telemetry status */}
          <div className="bg-slate-950/30 border border-slate-850 p-3.5 rounded-xl space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[9.5px] font-bold text-slate-350 font-mono uppercase tracking-wider block">
                Diagnóstico de Gases en Atmósfera (CAMS)
              </span>
              <span className="text-[8px] font-mono text-slate-500">Normal vs Registrado</span>
            </div>

            <div className="space-y-2.5">
              {/* Metano CH4 */}
              <div className="space-y-1">
                <div id="gas-ch4-simple" className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Metano (CH₄) - Alerta Gases</span>
                  <span className={`font-bold ${ch4 > 1.9 ? "text-red-400" : "text-emerald-400"}`}>
                    {ch4} ppm {ch4 > 1.9 ? "Alto" : "Estable"}
                  </span>
                </div>
                <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${ch4 > 1.9 ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min((ch4 / 5) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>

              {/* CO2 */}
              <div className="space-y-1">
                <div id="gas-co2-simple" className="flex justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Dióxido de Carbono (CO₂)</span>
                  <span className={`font-bold ${co2 > 420 ? "text-red-400" : "text-emerald-400"}`}>
                    {co2} ppm {co2 > 420 ? "Elevado" : "Estable"}
                  </span>
                </div>
                <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${co2 > 420 ? "bg-red-500" : "bg-emerald-500"}`}
                    style={{ width: `${Math.min((co2 / 600) * 100, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Simple directions overlay helper for acting */}
          <div className="bg-teal-950/10 border border-teal-900/30 p-3 rounded-xl flex items-start gap-2.5">
            <span className="text-sm"></span>
            <div className="text-[11px] text-slate-350 leading-normal font-sans">
              <strong>Ubicación de Precisión:</strong> El mapa satelital al lado se ha enfocado de forma precisa en estas coordenadas. Puede alternar las pestañas superiores de sensores satelitales (SWIR, NDVI, TIR) para visualizar la huella exacta. Pulse el botón de análisis para auditarla con nuestra IA.
            </div>
          </div>
        </div>
      ) : (
        /* Full advanced technical detailed expert parametrization form */
        <div className="space-y-4 animate-fade-in" id="expert-telemetry-form-inputs">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-amber-400 font-mono uppercase bg-amber-500/10 px-2 py-1 rounded border border-amber-500/25">
              Modo Configuración Avanzada de Telemetría
            </span>
            <button
              type="button"
              onClick={() => {
                // Clean/Reset to arbitrary custom incident values
                setLat(-38.352);
                setLon(-68.789);
                setType("Derrame en suelo");
                setWindSpeed(25);
                setWindDirection("SW");
                setCh4(1.8);
                setCO2(410);
                setNO2(15);
                setSO2(5);
                setSurface(1500);
                setDesc("Ingresa observaciones sobre el derrame observando el terreno...");
                setImagePayload("");
              }}
              className="text-[9px] text-teal-400 hover:text-teal-300 font-mono underline"
            >
              Limpiar Campos
            </button>
          </div>

          {/* GIS Positions */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-400 font-mono block">
              Posicionamiento geográfico (Vaca muerta)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-slate-550 font-mono block mb-1">Latitud (decimal)</span>
                <input 
                  type="number" 
                  step="0.0001"
                  min="-39.5"
                  max="-36.5"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-slate-200 font-mono focus:border-teal-500 outline-none"
                  id="input-latitude"
                  required
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-550 font-mono block mb-1">Longitud (decimal)</span>
                <input 
                  type="number" 
                  step="0.0001"
                  min="-70.5"
                  max="-67.5"
                  value={lon}
                  onChange={(e) => setLon(parseFloat(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-slate-200 font-mono focus:border-teal-500 outline-none"
                  id="input-longitude"
                  required
                />
              </div>
            </div>
          </div>

          {/* Windy Weather Settings */}
          <div className="space-y-3 bg-slate-950/50 p-3 rounded-xl border border-slate-850">
            <div className="flex items-center gap-1.5 text-slate-350 text-[11px] font-bold font-mono">
              <Compass className="w-3.5 h-3.5 text-sky-400" />
              <span>Condición meteorológica (WINDY)</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-slate-550 font-mono block mb-1">Velocidad Viento ({windSpeed} km/h)</span>
                <input 
                  type="range" 
                  min="5"
                  max="95"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(parseInt(e.target.value))}
                  className="w-full accent-sky-400 cursor-pointer h-1 bg-slate-900 rounded-lg mt-2"
                  id="slider-wind-speed"
                />
              </div>
              <div>
                <span className="text-[10px] text-slate-550 font-mono block mb-1">Dirección Procedencia</span>
                <select
                  value={windDirection}
                  onChange={(e) => setWindDirection(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 px-3 py-1.5 rounded-lg text-xs text-slate-200 font-sans focus:border-sky-400 outline-none"
                  id="select-wind-direction"
                >
                  <option value="SW">Sudoeste (SW) - Predominante</option>
                  <option value="W">Oeste (W) - Común</option>
                  <option value="NW">Noroeste (NW)</option>
                  <option value="N">Norte (N)</option>
                  <option value="S">Sur (S)</option>
                  <option value="E">Este (E)</option>
                </select>
              </div>
            </div>
          </div>

          {/* CAMS Gas Overlays */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold text-slate-400 font-mono block">
              Telemetría de compuestos atmosféricos (CAMS)
            </label>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-950 p-2 rounded-lg border border-slate-850">
                <span className="text-[9px] font-bold text-slate-500 font-sans block">Metano (CH₄)</span>
                <input 
                  type="number" 
                  step="0.1"
                  value={ch4}
                  onChange={(e) => setCh4(parseFloat(e.target.value))}
                  className="w-full bg-transparent text-xs text-sky-400 font-mono font-bold outline-none mt-1"
                  id="input-gas-ch4"
                  required
                />
                <span className="text-[8px] text-slate-600 block mt-0.5">ppm (Fond ~1.8)</span>
              </div>

              <div className="bg-slate-950 p-2 rounded-lg border border-slate-850">
                <span className="text-[9px] font-bold text-slate-500 font-sans block">Dióxido Carbono</span>
                <input 
                  type="number" 
                  step="1"
                  value={co2}
                  onChange={(e) => setCO2(parseFloat(e.target.value))}
                  className="w-full bg-transparent text-xs text-sky-400 font-mono font-bold outline-none mt-1"
                  id="input-gas-co2"
                  required
                />
                <span className="text-[8px] text-slate-600 block mt-0.5">ppm (Fond ~410)</span>
              </div>

              <div className="bg-slate-950 p-2 rounded-lg border border-slate-850">
                <span className="text-[9px] font-bold text-slate-500 font-sans block">Aux Nitrógeno</span>
                <input 
                  type="number" 
                  step="1"
                  value={no2}
                  onChange={(e) => setNO2(parseFloat(e.target.value))}
                  className="w-full bg-transparent text-xs text-sky-400 font-mono font-bold outline-none mt-1"
                  id="input-gas-no2"
                  required
                />
                <span className="text-[8px] text-slate-600 block mt-0.5">ppb (Fond ~15)</span>
              </div>

              <div className="bg-slate-950 p-2 rounded-lg border border-slate-850">
                <span className="text-[9px] font-bold text-slate-500 font-sans block">Azufre SO₂</span>
                <input 
                  type="number" 
                  step="1"
                  value={so2}
                  onChange={(e) => setSO2(parseFloat(e.target.value))}
                  className="w-full bg-transparent text-xs text-sky-400 font-mono font-bold outline-none mt-1"
                  id="input-gas-so2"
                  required
                />
                <span className="text-[8px] text-slate-600 block mt-0.5">ppb (Fond ~5)</span>
              </div>
            </div>
          </div>

          {/* Surface and Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-slate-450 font-bold font-mono block mb-1">Superficie comprometida (m²)</span>
              <input 
                type="number" 
                min="10"
                max="120000"
                value={surface}
                onChange={(e) => setSurface(parseInt(e.target.value))}
                className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-indigo-300 font-mono outline-none focus:border-teal-500"
                id="input-surface-area"
                required
              />
            </div>
            <div>
              <span className="text-[10px] text-slate-450 font-bold font-mono block mb-1">Categoría preliminar</span>
              <select 
                value={type} 
                onChange={(e) => setType(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-slate-200 font-sans outline-none focus:border-teal-500"
                id="select-incident-type"
              >
                <option value="Derrame en suelo">Derrame en Suelo / Crudo de Fractura</option>
                <option value="Venteo Atmosférico">Venteo Atmosférico (Metano Silencioso)</option>
                <option value="Fuga de Gas">Fuga de Gas a Presión</option>
                <option value="Anomalía Térmica">Anomalía Térmica (Flaring Ineficiente)</option>
                <option value="Acumulación de lodos">Acumulación de Lodos / Residuos Perforación</option>
              </select>
            </div>
          </div>

          {/* Custom satellite view selections or custom uploads */}
          <div className="space-y-3 bg-slate-950/80 p-4 border border-slate-850 rounded-xl">
            <label className="text-[11px] font-bold text-slate-400 font-mono block flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5 text-teal-400" />
              <span>Imagen satelital multiespectral / migración</span>
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              <button 
                type="button" 
                onClick={() => handlePresetImageSelect("oil_spill")}
                className={`border rounded-lg p-1.5 text-[9px] font-mono leading-tight flex flex-col items-center gap-1 transition-colors ${
                  imagePayload === SATELLITE_IMAGES.oil_spill 
                    ? "bg-teal-500/10 border-teal-500 text-teal-300" 
                    : "border-slate-850 hover:border-slate-700 bg-slate-900 text-slate-400"
                }`}
                id="preset-img-spill"
              >
                <span className="h-4 block font-sans"></span>
                <span>NIR Derrame</span>
              </button>
              
              <button 
                type="button" 
                onClick={() => handlePresetImageSelect("gas_leak")}
                className={`border rounded-lg p-1.5 text-[9px] font-mono leading-tight flex flex-col items-center gap-1 transition-colors ${
                  imagePayload === SATELLITE_IMAGES.gas_leak 
                    ? "bg-teal-500/10 border-teal-500 text-teal-300" 
                    : "border-slate-850 hover:border-slate-700 bg-slate-900 text-slate-400"
                }`}
                id="preset-img-gas"
              >
                <span className="h-4 block font-sans"></span>
                <span>SWIR Metano</span>
              </button>

              <button 
                type="button" 
                onClick={() => handlePresetImageSelect("thermal_flaring")}
                className={`border rounded-lg p-1.5 text-[9px] font-mono leading-tight flex flex-col items-center gap-1 transition-colors ${
                  imagePayload === SATELLITE_IMAGES.thermal_flaring 
                    ? "bg-teal-500/10 border-teal-500 text-teal-300" 
                    : "border-slate-850 hover:border-slate-700 bg-slate-900 text-slate-400"
                }`}
                id="preset-img-thermal"
              >
                <span className="h-4 block font-sans"></span>
                <span>TIR Flaring</span>
              </button>

              <button 
                type="button" 
                onClick={() => handlePresetImageSelect("sludge_pit")}
                className={`border rounded-lg p-1.5 text-[9px] font-mono leading-tight flex flex-col items-center gap-1 transition-colors ${
                  imagePayload === SATELLITE_IMAGES.sludge_pit 
                    ? "bg-teal-500/10 border-teal-500 text-teal-300" 
                    : "border-slate-850 hover:border-slate-700 bg-slate-900 text-slate-400"
                }`}
                id="preset-img-sludge"
              >
                <span className="h-4 block font-sans"></span>
                <span>Multispec Lodo</span>
              </button>

              <button 
                type="button" 
                onClick={() => handlePresetImageSelect("generic_soil")}
                className={`border rounded-lg p-1.5 text-[9px] font-mono leading-tight flex flex-col items-center gap-1 transition-colors ${
                  imagePayload === SATELLITE_IMAGES.generic_soil 
                    ? "bg-teal-500/10 border-teal-500 text-teal-300" 
                    : "border-slate-850 hover:border-slate-700 bg-slate-900 text-slate-400"
                }`}
                id="preset-img-soil"
              >
                <span className="h-4 block font-sans"></span>
                <span>Vegetación</span>
              </button>
            </div>

            {/* Upload element */}
            <div className="flex gap-3 pt-1 items-center">
              <div className="flex-1 relative cursor-pointer group bg-slate-900 hover:bg-slate-850 border border-slate-850 p-2 rounded-xl flex items-center justify-center gap-1.5 transition-colors text-center">
                <Upload className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-400" />
                <span className="text-[10px] text-slate-450 font-mono group-hover:text-teal-300">
                  {imagePayload ? "¡Archivo Vinculado!" : "Sube satélite JPG/PNG"}
                </span>
                <input 
                  type="file" 
                  accept="image/png, image/jpeg"
                  onChange={handleImageUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  id="file-image-upload"
                />
              </div>
              {imagePayload && (
                <div className="relative w-10 h-10 border border-slate-800 rounded bg-slate-950 overflow-hidden shrink-0">
                  <img 
                    src={imagePayload} 
                    alt="Miniatura de teledetección" 
                    className="w-full h-full object-cover" 
                    referrerPolicy="no-referrer"
                  />
                  <button 
                    type="button"
                    onClick={() => setImagePayload("")}
                    className="absolute top-0 right-0 bg-red-600/90 hover:bg-red-700 text-white w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded-bl"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <span className="text-[10px] text-slate-450 font-bold font-mono block mb-1">Observaciones físicas y detalles operativos</span>
            <textarea
              rows={3}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Añade descripciones del terreno de Vaca Muerta, eventos de presión o fallas observadas..."
              className="w-full bg-slate-950 border border-slate-850 px-3 py-2 rounded-xl text-xs text-slate-350 font-sans outline-none focus:border-teal-500 leading-normal"
              id="textarea-observations"
              required
            />
          </div>
        </div>
      )}

      {/* Submit Run Report always accessible */}
      <button
        type="submit"
        disabled={loading}
        className={`w-full py-3.5 rounded-xl text-xs font-bold font-mono text-slate-950 flex gap-2 items-center justify-center tracking-widest uppercase transition-colors shadow-lg ${
          loading 
            ? "bg-slate-800 text-slate-500 border border-slate-755 cursor-not-allowed" 
            : "bg-radial from-teal-300 to-emerald-400 hover:from-teal-200 hover:to-emerald-300 active:scale-98 shadow-teal-500/15"
        }`}
        id="btn-trigger-analysis"
      >
        <ShieldCheck className="w-4 h-4 text-slate-950 shrink-0 animate-pulse" />
        <span>{loading ? "Ejecutando Modelos..." : "Analizar Foco HSE con IA"}</span>
      </button>
    </form>
  );
}
