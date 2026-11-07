import React, { useState } from "react";
import { ShieldAlert, Users, Info, Table, CheckCircle2, AlertTriangle, Eye, Activity, FileText, Sparkles, HardHat, ShieldCheck, HelpCircle } from "lucide-react";

interface EvaluationRow {
  indicator: string;
  source: string;
  directMeasured: string;
  inferred: string;
  reliability: "Alta" | "Media" | "Baja";
  requiresValidation: string;
}

export default function MethodologicalAuditPanel() {
  const [activeRole, setActiveRole] = useState<string>("all");

  const roles = [
    {
      id: "teledeteccion",
      title: "Teledetección ESA (Sentinel-2/5P)",
      label: "Especialista Remote Sensing",
      desc: "El análisis espectral Sentinel proporciona estimaciones de columna y firmas ópticas robustas, operando como un sensor primario de alerta. No sustituye la espectrofotometría directa de muestras ni la reflectometría directa local.",
      warning: "Limitado por cobertura de nubes (Cloud Cover > 10%) y densidad de vegetación que obstruya el suelo desnudo."
    },
    {
      id: "hidrologo",
      title: "Hidrología de Cuencas",
      label: "Hidrólogo Ambiental",
      desc: "El NDWI es un proxy de reflectancia hídrica. Las anomalías son descriptivas de variabilidad del canal o lodos superficiales. Es imposible medir metales pesados o hidrocarburos solubles finos solo con óptica espacial.",
      warning: "24 NTU y turbidez reflejada son estimaciones basadas en algoritmos empíricos de reflectancia espectral. Requiere turbidímetro calibrado."
    },
    {
      id: "auditor",
      title: "Auditorías HSE O&G",
      label: "Auditor ISO 14001/45001",
      desc: "Los venteos e incendios térmicos se detectan por radiación de infrarrojo de onda corta (SWIR). El cálculo de volumen gaseoso es una estimación indirecta. Las auditorías corporativas exigen caudalímetros certificados en boca de pozo.",
      warning: "Riesgo de falsas alarmas por reflexiones metálicas industriales o variaciones de humedad esteparias."
    },
    {
      id: "inspector",
      title: "Inspección Neuquén (Ley 1875)",
      label: "Inspector Gubernamental",
      desc: "Los datos satelitales no constituyen prueba pericial firme por sí solos en sumarios bajo Ley 1875. Actúan como el gatillo legítimo por riesgo ambiental crítico que ampara el inicio formal de una inspección pericial en terreno.",
      warning: "No usar para multas directas. Es la firma pericial in-situ la que ratifica el pasivo ambiental."
    },
    {
      id: "gis",
      title: "Ciencia de Datos & GIS",
      label: "Especialista GIS",
      desc: "La grilla tiene una resolución espacial de 10m (Sentinel-2) y 3.5km (Sentinel-5P). Existe incertidumbre subpíxel. Los bordes de pixel de los desvíos se interpolan matemáticamente y no reflejan fronteras físicas perfectas.",
      warning: "La superficie afectada computada es un polígono de píxeles activos, no una topografía catastral real."
    }
  ];

  const evaluationData: EvaluationRow[] = [
    {
      indicator: "CH4 (Metano)",
      source: "Copernicus Sentinel-5P (TROPOMI) / CAMS",
      directMeasured: "Ninguno (Satelital)",
      inferred: "Concentración en columna total de aire (ppb / ppm)",
      reliability: "Media",
      requiresValidation: "Cámara portátil OGI, detectores PID / FID portátiles o sensor de celda láser in-situ."
    },
    {
      indicator: "CO2 (Dióxido de Carbono)",
      source: "Modelado atmosférico CAMS regional y satélites",
      directMeasured: "Ninguno (Satelital)",
      inferred: "Concentración global en columna atmosférica (ppm)",
      reliability: "Baja",
      requiresValidation: "Sensores de gas infrarrojos no dispersivos (NDIR) fijos o portátiles en pozo."
    },
    {
      indicator: "NO2 (Dióxido de Nitrógeno)",
      source: "Sentinel-5P (Columna troposférica)",
      directMeasured: "Ninguno (Satelital)",
      inferred: "Pluma de combustión e industrialización (ppb)",
      reliability: "Alta",
      requiresValidation: "Estación meteorológica local de calidad de aire con sensores electroquímicos."
    },
    {
      indicator: "SO2 (Dióxido de Azufre)",
      source: "Sentinel-5P (Emisión volcánica / industrial)",
      directMeasured: "Ninguno (Satelital)",
      inferred: "Presencia de gases amargos / ácidos (ppb)",
      reliability: "Alta",
      requiresValidation: "Tubo colorimétrico o analizadores de fluorescencia UV en terreno."
    },
    {
      indicator: "NDWI (Índice de Agua)",
      source: "Sentinel-2 (Fórmula Green-NIR)",
      directMeasured: "Reflectancia en bandas espectrales (B3, B8)",
      inferred: "Presencia de masa hídrica vs suelo seco",
      reliability: "Alta",
      requiresValidation: "Sondaje clásico terrestre y corroboración de límites costeros fluviales."
    },
    {
      indicator: "Turbidez (Canales Hídricos)",
      source: "Inferencia empírica sobre reflectancia óptica",
      directMeasured: "Ninguno (Satelital)",
      inferred: "Carga de sedimentos en suspensión (NTU)",
      reliability: "Media",
      requiresValidation: "Toma de muestras + Lectura de turbidímetro de laboratorio o sonda multiparamétrica."
    },
    {
      indicator: "Superficie Afectada",
      source: "Clasificación multiespectral sobre píxeles",
      directMeasured: "Conteo matemático de píxeles activos",
      inferred: "Área de impacto geofísico real (m²)",
      reliability: "Media",
      requiresValidation: "Mapeo terrestre con Drones (UAV RTK) o topografía con GPS diferencial."
    },
    {
      indicator: "Riesgo de Contaminación",
      source: "Heurísticas del motor de análisis de IA",
      directMeasured: "Ninguno",
      inferred: "Nivel de amenaza ambiental",
      reliability: "Baja",
      requiresValidation: "Evaluación cuantitativa de riesgos (ERA) conforme a la norma ISO 14001."
    },
    {
      indicator: "Riesgo Hidrogeológico",
      source: "Simulador de pendientes y cercanía hídrica",
      directMeasured: "Distancia euclidiana sobre mapas vectoriales",
      inferred: "Probabilidad de flujo aluvial contaminante",
      reliability: "Media",
      requiresValidation: "Perfiles de pozos de monitoreo freático y conductividad hidráulica del suelo."
    },
    {
      indicator: "Probabilidad de Derrame",
      source: "Machine Learning / Heurística térmica e NDWI",
      directMeasured: "Ninguno",
      inferred: "Porcentaje de coincidencia de firma espectral",
      reliability: "Baja",
      requiresValidation: "Handshake de operador y confirmación visual o reporte físico de guardia de pozo."
    },
    {
      indicator: "Crecimiento Histórico",
      source: "Análisis espectral serial multitemporal",
      directMeasured: "Variación de NDWI interanual computada",
      inferred: "Evolución y persistencia del pasivo ambiental",
      reliability: "Media",
      requiresValidation: "Inspecciones de control de restauración ecológica en el suelo afectado."
    }
  ];

  return (
    <div id="methodological-audit-framework-card" className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Flag / Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="p-1 px-2.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-mono font-bold tracking-wider uppercase border border-amber-500/20 flex items-center gap-1.5 animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5" />
              Marco cognitivo integral de auditoría
            </span>
            <span className="text-[10px] text-slate-400 font-mono">Nivel: profesional defensible</span>
          </div>
          <h2 className="text-xl font-black text-slate-100 font-sans tracking-tight">
            Análisis Crítico & Marco Metodológico Multidisciplinario
          </h2>
          <p className="text-xs text-slate-400 max-w-3xl mt-1 leading-relaxed">
            Evaluación técnica de la confiabilidad de los indicadores clave para convertir la plataforma desde un prototipo demostrativo hacia un <b>sistema de monitoreo ambiental profesional</b> auditable por agencias internacionales (ESA, NASA, AIC, COIRCO).
          </p>
        </div>
      </div>

      {/* Critical Alert Banner requested specifically: lacking in-situ but warrants inspection */}
      <div className="p-5 rounded-xl border border-amber-500/30 bg-amber-500/10 mb-6 space-y-2.5" id="critical-insitu-alert-banner">
        <div className="flex items-center gap-2.5 text-amber-400 font-bold text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 animate-bounce text-amber-400" />
          <span>Declaración de validación y criterio de acción regulatorio</span>
        </div>
        <div className="space-y-2 text-xs text-slate-200 leading-relaxed">
          <p>
            <strong>Nota de control crítico:</strong> A la fecha, este reporte 
            <span className="text-amber-300 font-black underline bg-amber-900/20 px-1 rounded ml-1 mr-1">Falta validación in-situ</span> 
            (muestreo físico terrestre, espectrofotometría de campo y calibración directa por sensor piezométrico). Las firmas ópticas y de teledetección poseen un nivel de incertidumbre inherente a los algoritmos empíricos orbitales.
          </p>
          <p className="text-slate-300">
            <strong>Sin embargo:</strong> Los valores atmosféricos e índices espectrales observados en la presente órbita 
            <span className="text-emerald-400 font-bold decoration-dotted underline">Ameritan una inspección inmediata en terreno</span>. 
            La confluencia de anomalías en el NDWI, la presencia coincidente de temperaturas elevadas y la acumulación gaseosa detectada por el sensor TROPOMI plantean un nivel de riesgo sustancial para el Río Neuquén y las comunidades linderas (Añelo/Tratayén), justificando de forma técnica y legal la activación de protocolos de contingencia y auditoría HSE acelerada.
          </p>
        </div>
      </div>

      {/* Interactive simulated experts block */}
      <div className="space-y-3 mb-8">
        <h3 className="text-xs font-black text-slate-350 tracking-wider uppercase font-mono flex items-center gap-1.5">
          <Users className="w-4 h-4 text-sky-400" />
          Perspectiva del Comité Externo de Revisión Pericial
        </h3>
        
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveRole("all")}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
              activeRole === "all"
                ? "bg-sky-500/10 border-sky-400 text-sky-300 font-bold"
                : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-750"
            }`}
          >
            Todos los Expertos
          </button>
          {roles.map((role) => (
            <button
              key={role.id}
              onClick={() => setActiveRole(role.id)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors cursor-pointer ${
                activeRole === role.id
                  ? "bg-teal-500/10 border-teal-400 text-teal-300 font-bold"
                  : "bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-750"
              }`}
            >
              {role.label}
            </button>
          ))}
        </div>

        {/* Display filtered roles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {roles
            .filter((role) => activeRole === "all" || role.id === activeRole)
            .map((role) => (
              <div
                key={role.id}
                className="p-4 rounded-xl border border-slate-850 bg-slate-950/40 flex flex-col justify-between hover:border-slate-800 transition-colors duration-300 group"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-sky-400 font-mono tracking-wider uppercase">
                      {role.label}
                    </span>
                    <span className="text-slate-600 group-hover:text-amber-500 transition-colors">
                      <HardHat className="w-4 h-4" />
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-200 mb-1.5 font-sans">
                    {role.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                    {role.desc}
                  </p>
                </div>
                <div className="mt-3 pt-3 border-t border-slate-900/60 text-[10px] text-amber-400/90 leading-normal flex items-start gap-1.5 font-mono">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1"></div>
                  <span>
                    <strong>Incertidumbre:</strong> {role.warning}
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Observation audits summary block (YPF, AIC etc) */}
      <h3 className="text-xs font-black text-slate-350 tracking-wider uppercase font-mono flex items-center gap-1.5 mb-3">
        <FileText className="w-4 h-4 text-sky-400" />
        Observaciones críticas previstas de Organismos y Operadoras
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-xs">
        <div className="p-3 bg-slate-950/20 border border-slate-850 rounded-xl space-y-1.5">
          <span className="font-bold text-emerald-400 block font-sans">Coirco / aic (Autoridad de Cuencas)</span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            &ldquo;Exigirían que la pluma NDWI aguas abajo de los vertidos se separe categóricamente de la presencia de sólidos suspendidos naturales o escurrimientos pluviales arcillosos que poseen firmas ópticas similares. No se pueden imputar 24 NTU sin una estación limnigráfica síncrona instalada por AIC.&rdquo;
          </p>
        </div>
        <div className="p-3 bg-slate-950/20 border border-slate-850 rounded-xl space-y-1.5">
          <span className="font-bold text-emerald-400 block font-sans">Secretaría de Medio Ambiente de Neuquén</span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            &ldquo;Advertiría que una imputación formal de infracciones bajo la Ley Provincial 1875 demanda estricta cadena de custodia física del agua y del suelo. La teledetección es un elemento secundario de inteligencia policial ambiental, insuficiente para cursar multas.&rdquo;
          </p>
        </div>
        <div className="p-3 bg-slate-950/20 border border-slate-850 rounded-xl space-y-1.5">
          <span className="font-bold text-amber-400 block font-sans">YPF / Pluspetrol / Tecpetrol (Operadoras)</span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            &ldquo;Cuestionarían los niveles basales de CH4 y CO2 de Sentinel-5P debido a que la baja resolución espacial de 3.5km promedia cuencas completas, impidiendo individualizar el venteo del pozo del operador frente a emisiones basales de la barda de Añelo.&rdquo;
          </p>
        </div>
        <div className="p-3 bg-slate-950/20 border border-slate-850 rounded-xl space-y-1.5">
          <span className="font-bold text-teal-400 block font-sans">Auditorías ISO 14001 / ISO 45001</span>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            &ldquo;Impondría no conformidades de tipo mayor si se implementa un software de seguridad que active alarmas de evacuación comunitarias únicamente usando estimaciones de viento de Windy sin anemometría local certificada.&rdquo;
          </p>
        </div>
      </div>

      {/* Table: Defensibility of Indicators */}
      <div className="space-y-3 mb-6">
        <h3 className="text-xs font-black text-slate-350 tracking-wider uppercase font-mono flex items-center gap-1.5">
          <Table className="w-4 h-4 text-sky-400" />
          Matriz de Defendibilidad Científica de Indicadores
        </h3>

        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 border-b border-slate-800 text-slate-300 font-mono text-[10.5px]">
                <th className="p-3 font-semibold">Indicador</th>
                <th className="p-3 font-semibold">Fuente Satelital/Inferencia</th>
                <th className="p-3 font-semibold text-center">Medido Directamente</th>
                <th className="p-3 font-semibold text-center">Inferido/Modelo</th>
                <th className="p-3 font-semibold text-center">Confiabilidad</th>
                <th className="p-3 font-semibold">Validación Requerida In-situ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850/60 bg-slate-950/20 text-slate-350 leading-relaxed">
              {evaluationData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-900/35 transition-colors">
                  <td className="p-3 font-bold text-slate-200">{row.indicator}</td>
                  <td className="p-3 text-[11px] font-mono text-slate-400">{row.source}</td>
                  <td className="p-3 text-center text-[11px] font-mono">
                    {row.directMeasured !== "Ninguno" ? (
                      <span className="text-teal-450 bg-teal-500/10 px-2 py-0.5 rounded font-bold">
                        {row.directMeasured}
                      </span>
                    ) : (
                      <span className="text-slate-500">No</span>
                    )}
                  </td>
                  <td className="p-3 text-[11px] text-slate-300">{row.inferred}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded font-mono font-bold text-[9.5px] uppercase ${
                      row.reliability === "Alta"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-550/20"
                        : row.reliability === "Media"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-550/20"
                          : "bg-red-500/10 text-red-400 border border-red-550/20"
                    }`}>
                      {row.reliability}
                    </span>
                  </td>
                  <td className="p-3 text-[11px] text-slate-400">{row.requiresValidation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendations roadmap to professional system */}
      <div className="bg-slate-950/80 border border-slate-850 p-4 rounded-xl">
        <h4 className="text-xs font-bold text-slate-200 tracking-wide mb-3 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-teal-400" />
          Ruta de Transición: Prototipo Experimental &rarr; Plataforma Profesional Defendible
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-400 leading-normal">
          <div className="space-y-1.5 p-3 bg-slate-900/40 border border-slate-850 rounded-lg">
            <span className="font-bold text-slate-300 block">Fase 1: Enlace OIDC & QC</span>
            <p className="text-[11px]">Integración directa del Sentinel Hub OIDC para descargar escenas sin compresión (L2A), implementando filtros rigurosos de clasificación de nubes y ángulo de inclinación solar.</p>
          </div>
          <div className="space-y-1.5 p-3 bg-slate-900/40 border border-slate-850 rounded-lg">
            <span className="font-bold text-slate-300 block">Fase 2: Red de IoT Terrestre</span>
            <p className="text-[11px]">Instalación de estaciones fijas de monitoreo hídrico en el Río Neuquén inferior y sensores multiparamétricos de canal para calibrar turbidez óptica frente a NTU reales.</p>
          </div>
          <div className="space-y-1.5 p-3 bg-slate-900/40 border border-slate-850 rounded-lg">
            <span className="font-bold text-slate-300 block">Fase 3: Algoritmo de Calibración</span>
            <p className="text-[11px]">Ajuste por machine learning emparejando reflectancia espectral con lecturas PID de gas metano local, corrigiendo viento mediante estaciones certificadas en el valle.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
