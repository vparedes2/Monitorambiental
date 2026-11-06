import React, { useState, useEffect } from "react";
import { Hotspot } from "../types";
import { PRESET_HOTSPOTS } from "../presets";
import { Radio, Database, RefreshCw, Layers, CheckCircle2, AlertTriangle, Cpu, Globe, ArrowRight, Server, ShieldCheck } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SatelliteConnectionPanelProps {
  selectedHotspot: Hotspot | null;
}

export default function SatelliteConnectionPanel({ selectedHotspot }: SatelliteConnectionPanelProps) {
  const [loading, setLoading] = useState(false);
  const [apiResult, setApiResult] = useState<any>(null);
  const [lastQueryCoords, setLastQueryCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [pingTime, setPingTime] = useState<number | null>(null);
  const [isLiveConnection, setIsLiveConnection] = useState<boolean>(true);

  // Default coordinate set corresponding to active hotspot or Vaca Muerta center
  const targetHotspot = selectedHotspot || PRESET_HOTSPOTS[0];

  const fetchRealSatelliteData = async (lat: number, lon: number) => {
    setLoading(true);
    const startTime = performance.now();
    try {
      const res = await fetch(`/api/satellite-connection?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      const endTime = performance.now();
      
      setPingTime(Math.round(endTime - startTime));
      setApiResult(data);
      setLastQueryCoords({ lat, lon });
      setIsLiveConnection(data.success);
    } catch (err) {
      console.error("Failure while retrieving live space dataset:", err);
      setIsLiveConnection(false);
    } finally {
      setLoading(false);
    }
  };

  // Auto-fetch on selection change to make the map and audit experience fully automated
  useEffect(() => {
    fetchRealSatelliteData(targetHotspot.latitude, targetHotspot.longitude);
  }, [targetHotspot.id]);

  return (
    <div id="satellite-connection-panel" className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden mt-8">
      {/* Background radial highlight */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1 px-2 rounded bg-teal-500/15 text-teal-400 text-[9px] font-mono font-bold tracking-wider uppercase border border-teal-500/20">
              INTEGRACIÓN LIVE-FEED
            </span>
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono font-bold">
              <span className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${loading ? "animate-ping" : ""}`}></span>
              {apiResult?.authenticated 
                ? "ENLACE PRIVADO OIDC ACTIVO" 
                : apiResult?.credentialsLoaded
                  ? "CREDENCIALES NO VÁLIDAS - MODO PÚBLICO"
                  : "CATÁLOGO ABIERTO CDSE (ACCESO LIBRE)"
              }
            </div>
          </div>
          <h3 className="text-base font-black text-slate-100 font-sans tracking-tight">
            Consola de Teledetección y Enlace ESA/NASA
          </h3>
          <p className="text-xs text-slate-400 max-w-2xl mt-0.5 leading-relaxed">
            Pasarela de comunicación satelital directa con el ecosistema <b>Copernicus Data Space Ecosystem (CDSE)</b> de la Agencia Espacial Europea (ESA) y la red <b>OpenAQ</b> para telemetría multiespectral y atmosférica de Vaca Muerta.
          </p>
        </div>

        <button
          onClick={() => fetchRealSatelliteData(targetHotspot.latitude, targetHotspot.longitude)}
          disabled={loading}
          className="px-4 py-2 bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 text-slate-200 text-xs font-mono font-black rounded-xl flex items-center gap-2 transition-all cursor-pointer select-none shrink-0"
          id="btn-retrigger-sat"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${loading ? "animate-spin" : ""}`} />
          {loading ? "ESCANEANDO ÓRBITA..." : "VOLVER A ESCANEAR ORBITAL"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Connection Status Bar & Console Log */}
        <div className="lg:col-span-4 flex flex-col justify-between">
          <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl flex-1 flex flex-col justify-between">
            <div>
              <span className="text-[9px] font-bold font-mono tracking-wider text-slate-500 uppercase">
                ESTADO DE LA PASARELA DE DATOS
              </span>
              
              <div className="mt-3 space-y-3">
                <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-teal-500" /> API Endpoint
                  </span>
                  <span className="font-mono text-[10px] text-slate-300 font-bold max-w-[150px] truncate">
                    dataspace.copernicus.eu
                  </span>
                </div>
                
                <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-amber-500" /> Tiempo de Respuesta
                  </span>
                  <span className="font-mono text-[10px] text-slate-300 font-bold">
                    {pingTime ? `${pingTime} ms` : "---"}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-400" /> Bounding Box
                  </span>
                  <span className="font-mono text-[9px] text-slate-350 font-bold">
                    [{(targetHotspot.longitude - 0.5).toFixed(1)}, {(targetHotspot.latitude - 0.5).toFixed(1)}, {(targetHotspot.longitude + 0.5).toFixed(1)}, {(targetHotspot.latitude + 0.5).toFixed(1)}]
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-400" /> Tipo de Enlace
                  </span>
                  <span className="font-mono text-[9.5px] font-black text-slate-200">
                    {apiResult?.authenticated ? "PRIVADO & AUTENTICADO OIDC" : "CATÁLOGO ABIERTO PÚBLICO"}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-900">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Claves Privadas
                  </span>
                  <span className={`font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                    apiResult?.credentialsLoaded 
                      ? apiResult?.authenticated ? "text-emerald-400 bg-emerald-500/10" : "text-amber-400 bg-amber-500/10"
                      : "text-slate-400 bg-slate-800/60"
                  }`}>
                    {apiResult?.credentialsLoaded ? (apiResult?.authenticated ? "CONFIGURADAS Y VALIDAS" : "VENCIDAS / INVÁLIDAS") : "NO REQUERIDAS (MODO LIBRE)"}
                  </span>
                </div>

                {apiResult?.credentialsLoaded && (
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Handshake OIDC
                    </span>
                    <span className={`font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                      apiResult?.authenticated 
                        ? "text-emerald-400 bg-emerald-500/10" 
                        : "text-amber-400 bg-amber-500/10"
                    }`}>
                      {apiResult?.authenticated ? "TOKEN ACTIVO" : "FALLÓ - USANDO OPEN CDSE"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Simulated Live Orbit Tracking Graphic */}
            <div className="mt-5 pt-4 border-t border-slate-900">
              <span className="text-[9px] font-bold font-mono tracking-wider text-teal-500 uppercase block mb-2">
                Simulación Orbital de Barrido (Sentinel over Vaca Muerta)
              </span>
              <div className="bg-slate-900 h-24 rounded-lg relative overflow-hidden flex items-center justify-center border border-slate-800">
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-40"></div>
                
                {/* Simulated coordinate circle */}
                <div className="w-16 h-16 rounded-full border border-teal-500/20 absolute animate-pulse"></div>
                <div className="w-8 h-8 rounded-full border border-teal-500/40 absolute animate-ping duration-1000"></div>
                
                {/* Flight path line */}
                <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-teal-400 to-transparent absolute rotate-12"></div>
                
                <span className="text-[9px] text-slate-300 font-mono bg-slate-950/95 px-2 py-1 rounded border border-slate-800 relative z-10 font-bold">
                  S5P Orbit Pass #{(targetHotspot.latitude * 144).toFixed(0).replace("-", "")}
                </span>

                {/* Satellite symbol */}
                <div className="absolute top-4 left-6 animate-bounce">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 block"></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Center/Right Side: Live Satellite Tile responses */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex-1">
            <h4 className="text-xs font-black text-slate-350 font-mono tracking-wider uppercase mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-400" />
              Imágenes y Archivos Disponibles en ESA Copernicus ({apiResult?.scenes?.length || 0} escenas)
            </h4>

            {loading ? (
              <div className="h-44 flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-teal-400 animate-spin" />
                <span className="text-xs text-slate-400 font-mono font-bold">Interrogando archivos públicos de órbitas de Copernicus...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {apiResult?.scenes && apiResult.scenes.length > 0 ? (
                  apiResult.scenes.map((scene: any) => (
                    <div 
                      key={scene.id} 
                      className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex gap-4 items-center justify-between"
                    >
                      <div className="flex gap-3 items-center min-w-0">
                        {/* Thumbnail or platform logo */}
                        <div className="w-12 h-12 rounded bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 overflow-hidden relative">
                          {scene.thumbnailUrl ? (
                            <img 
                              src={scene.thumbnailUrl} 
                              alt="Sat" 
                              className="w-full h-full object-cover" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Globe className="w-5 h-5 text-teal-500/70" />
                          )}
                          <span className="absolute bottom-0 right-0 bg-slate-900/90 text-[6px] px-1 text-teal-400 font-mono uppercase font-bold">
                            {scene.platform.split(" ")[0]}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <h5 className="text-[11px] font-black font-mono text-slate-200 truncate leading-tight">
                            {scene.id}
                          </h5>
                          <p className="text-[9.5px] text-slate-400 mt-1 flex items-center gap-2">
                            <span className="text-slate-300 font-bold">{scene.platform}</span>
                            <span className="text-slate-500">|</span>
                            <span>{new Date(scene.datetime).toLocaleDateString("es-AR")}</span>
                            {scene.cloudCover !== null && (
                              <>
                                <span className="text-slate-500">|</span>
                                <span className={scene.cloudCover > 20 ? "text-amber-500" : "text-emerald-400 font-bold"}>
                                  Nubes: {scene.cloudCover.toFixed(1)}%
                                </span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Download size tag */}
                      <span className="text-[9px] font-mono font-bold bg-slate-950/70 border border-slate-800 px-2 py-0.5 rounded text-slate-300 whitespace-nowrap hidden sm:inline-block">
                        {scene.dataSize}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-lg text-center text-xs text-slate-400">
                    No se encontraron pasadas satelitales en el rango temporal indicado. Intente re-escanear.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Area: OpenAQ real ground air monitors */}
          <div className="bg-slate-950/40 border border-slate-850 rounded-xl p-4">
            <h4 className="text-xs font-black text-slate-350 font-mono tracking-wider uppercase mb-3 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-500" />
              Sensores Terrestres de Soporte en Tiempo Real (Red Abierta OpenAQ)
            </h4>

            {loading ? (
              <div className="h-12 flex items-center justify-center">
                <span className="text-xs text-slate-500 font-mono">Buscando mediciones en tiempo real...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3" id="openaq-grid">
                {apiResult?.aqStations && apiResult.aqStations.length > 0 ? (
                  apiResult.aqStations.slice(0, 2).map((st: any, idx: number) => (
                    <div 
                      key={`${st.location}-${idx}`}
                      className="bg-slate-900/50 border border-slate-800 p-3 rounded-lg flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-bold text-slate-300 truncate max-w-[70%]">
                            {st.location}
                          </span>
                          <span className="text-[8px] font-mono text-slate-500 uppercase font-black">
                            {st.city}
                          </span>
                        </div>
                        
                        {/* Values row */}
                        <div className="flex gap-2.5 mt-2.5 flex-wrap">
                          {st.measurements.slice(0, 3).map((meas: any, mIdx: number) => (
                            <div 
                              key={mIdx} 
                              className="bg-slate-950 px-2 py-1 rounded border border-slate-850 flex items-center gap-1 text-[10px] font-mono"
                            >
                              <span className="text-slate-500 font-bold uppercase">{meas.parameter}:</span>
                              <span className="text-teal-400 font-black">{meas.value}</span>
                              <span className="text-slate-450 text-[8px]">{meas.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="bg-slate-900/40 col-span-2 border border-slate-800 text-center p-3 text-xs text-slate-500">
                    No se recuperaron estaciones terrestres en tiempo real en los alrededores de la cuenca.
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Proof of active connection banner */}
      <div className={`mt-4 p-3 border rounded-xl flex items-center justify-between gap-4 transition-all duration-350 ${
        apiResult?.authenticated
          ? "bg-emerald-950/20 border-emerald-500/30 text-emerald-350"
          : apiResult?.credentialsLoaded && !apiResult?.authenticated
          ? "bg-amber-950/20 border-amber-500/30 text-amber-350"
          : "bg-teal-950/25 border-teal-900/30 text-teal-350"
      }`}>
        <div className="flex items-center gap-2 text-[10.5px] leading-snug">
          {apiResult?.credentialsLoaded && !apiResult?.authenticated ? (
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          ) : (
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${apiResult?.authenticated ? "text-emerald-400" : "text-teal-400"}`} />
          )}
          <span>
            {apiResult?.authenticated ? (
              <>
                <b>¡Conexión OIDC privada autorizada!</b> Tu cuenta de <b>Copernicus CDSE</b> está autorizada por token y transmitiendo catálogos satelitales en vivo para la cuenca neuquina.
              </>
            ) : apiResult?.credentialsLoaded ? (
              <>
                <b>Aviso sobre claves privadas:</b> Las credenciales de Copernicus configuradas en variables de entorno fueron rechazadas por el servidor OIDC (posiblemente vencidas o con permisos no asignados). La aplicación continúa consultando el <b>Catálogo Abierto de Copernicus CDSE</b> sin interrupciones.
              </>
            ) : (
              <>
                <b>Catálogo Abierto ESA Copernicus verificado:</b> No se requieren claves privadas para operar. Este módulo consulta en vivo las pasadas orbitales de <b>Sentinel-2C MSI</b> y <b>Sentinel-5P TROPOMI</b> directamente del servidor público de Copernicus CDSE sobre Vaca Muerta.
              </>
            )}
          </span>
        </div>
        <div className={`px-2.5 py-0.5 text-slate-950 text-[9px] font-black font-mono rounded-full uppercase shrink-0 ${
          apiResult?.authenticated 
            ? "bg-emerald-400" 
            : apiResult?.credentialsLoaded 
            ? "bg-amber-400" 
            : "bg-teal-400"
        }`}>
          {apiResult?.authenticated ? "OIDC PRIVADO" : apiResult?.credentialsLoaded ? "CATÁLOGO ABIERTO" : "OPEN CDSE"}
        </div>
      </div>
    </div>
  );
}
