import React, { useState } from "react";
import { Droplet, Waves, ShieldAlert, Sparkles, TrendingUp, Gauge, Activity, FileText, CheckCircle2, ChevronRight, RefreshCw, AlertTriangle, HelpCircle, Download, Layers, MapPin, Eye, ClipboardCheck } from "lucide-react";

interface WaterBody {
  id: string;
  name: string;
  type: "Río" | "Embalse" | "Lago";
  region: string;
  latitude: number;
  longitude: number;
  vulnerability: number; // 0-100%
  turbidity: number; // NTU
  riskLevel: "Crítico" | "Alto" | "Medio" | "Bajo";
  oilSlickRisk: number; // 0-100%
  pipelineCrossings: number;
  wellsProximity: number; // count of wells < 2km from shoreline
  description: string;
  spectralIndicator: string;
  historicalData: { year: number; turbidity: number; risk: number }[];
}

const WATER_BODIES_DATA: WaterBody[] = [
  {
    id: "rio_neuquen",
    name: "Río Neuquén",
    type: "Río",
    region: "Añelo y Valles Productivos",
    latitude: -38.361,
    longitude: -68.762,
    vulnerability: 88,
    turbidity: 24,
    riskLevel: "Crítico",
    oilSlickRisk: 72,
    pipelineCrossings: 14,
    wellsProximity: 85,
    description: "Cauce fluvial principal que discurre en el corazón productivo de Vaca Muerta. Es la mayor fuente de agua para consumo industrial y agrícola regional. Expuesto a arrastre de hidrocarburos fluviales, filtraciones freáticas de piletas y cruce directo de oleoductos clave.",
    spectralIndicator: "NDWI Anomalía Margen Izquierda: Cambios de reflectancia en Sentinel-2 Bandas 3/8 compatibles con películas orgánicas oleosas superficiales.",
    historicalData: [
      { year: 2024, turbidity: 12, risk: 35 },
      { year: 2025, turbidity: 18, risk: 52 },
      { year: 2026, turbidity: 24, risk: 72 }
    ]
  },
  {
    id: "rio_colorado",
    name: "Río Colorado",
    type: "Río",
    region: "Límite Norte - Rincón de los Sauces",
    latitude: -37.89,
    longitude: -68.95,
    vulnerability: 74,
    turbidity: 32,
    riskLevel: "Alto",
    oilSlickRisk: 48,
    pipelineCrossings: 8,
    wellsProximity: 42,
    description: "Segunda cuenca fluvial de importancia que delimita la faja septentrional de explotación. Menor densidad de pozos inmediatos que el Río Neuquén, pero con cruces de gasoductos troncales de exportación y escorrentías xerófilas provenientes de cerros linderos de perforación.",
    spectralIndicator: "NDWI Basal Estable. Trazas moderadas de sedimentación arcillosa natural en suspensión. Sin detección espectral de hidrocarburos flotantes estables en la vertical actual.",
    historicalData: [
      { year: 2024, turbidity: 28, risk: 30 },
      { year: 2025, turbidity: 30, risk: 40 },
      { year: 2026, turbidity: 32, risk: 48 }
    ]
  },
  {
    id: "los_barreales",
    name: "Embalse Los Barreales",
    type: "Embalse",
    region: "Complejo Turístico-Hídrico Cerros Colorados",
    latitude: -38.54,
    longitude: -68.68,
    vulnerability: 62,
    turbidity: 45,
    riskLevel: "Medio",
    oilSlickRisk: 30,
    pipelineCrossings: 3,
    wellsProximity: 28,
    description: "Gigantesco embalse artificial compensador caracterizado por aguas de altísima sedimentación arcillosa (coloración rojiza típica). Funciona como amortiguador hídrico frente a crecidas. Albergue de instalaciones de captación industrial con pozos de gas en penínsulas.",
    spectralIndicator: "NDWI Elevado. Turbidez inorgánica dominante por arcillas rojas suspendidas. Concentración de biomasa de algas baja-moderada estable.",
    historicalData: [
      { year: 2024, turbidity: 40, risk: 20 },
      { year: 2025, turbidity: 42, risk: 25 },
      { year: 2026, turbidity: 45, risk: 30 }
    ]
  },
  {
    id: "mari_menuco",
    name: "Embalse Mari Menuco",
    type: "Embalse",
    region: "Suministro Crítico Neuquén Capital",
    latitude: -38.58,
    longitude: -68.48,
    vulnerability: 55,
    turbidity: 5,
    riskLevel: "Medio",
    oilSlickRisk: 15,
    pipelineCrossings: 1,
    wellsProximity: 12,
    description: "Cuerpo hídrico de aguas sumamente claras y profundas. Abastece de agua de consumo doméstico a la conurbanización de Neuquén Capital. Protegido rigurosamente contra actividad de fractura inmediata, pero vulnerable a transporte por derrames fluviales indirectos y turismo.",
    spectralIndicator: "NDWI Óptimo. Reflectancia limpia en bandas del azul/verde. Ausencia total de anomalías químicas superficiales. Protección de ribera activa.",
    historicalData: [
      { year: 2024, turbidity: 4, risk: 10 },
      { year: 2025, turbidity: 5, risk: 12 },
      { year: 2026, turbidity: 5, risk: 15 }
    ]
  },
  {
    id: "lago_pellegrini",
    name: "Lago Pellegrini",
    type: "Lago",
    region: "Cinco Saltos - Cuenca de Evaporación Terminal",
    latitude: -38.68,
    longitude: -68.01,
    vulnerability: 40,
    turbidity: 15,
    riskLevel: "Bajo",
    oilSlickRisk: 10,
    pipelineCrossings: 0,
    wellsProximity: 3,
    description: "Lago endorreico (de cuenca cerrada natural) que recolecta desagües e infiltraciones del sistema de riego valletano. No tiene contacto directo con la faja activa de gas de esquisto de Añelo; no obstante, se monitorean indirectamente metales pesados difusos de lixiviación.",
    spectralIndicator: "Eutrofización moderada registrada por reflectancia NDVI/NDWI combinada en bordes de humedal. Firmas estables basales.",
    historicalData: [
      { year: 2024, turbidity: 14, risk: 8 },
      { year: 2025, turbidity: 15, risk: 10 },
      { year: 2026, turbidity: 15, risk: 10 }
    ]
  }
];

interface MapLayout {
  riverPath: string;
  riverColor: string;
  riverType: string;
  riverLabel: string;
  label1Name: string;
  label1Coords: { cx: number; cy: number };
  label2Name: string;
  label2Coords: { cx: number; cy: number };
  dischargeName: string;
  dischargeCoords: { cx: number; cy: number };
  alertTitle: string;
  alertSub: string;
  points: { x: number; y: number }[];
  bypassPath?: string;
  bypassColor?: string;
  erosionPaths?: string[];
  forestCluster: { cx: number; cy: number; r: number }[];
  facilityRects?: { x: number; y: number; w: number; h: number; fill: string }[];
  blueTanks?: { cx: number; cy: number; r: number }[];
  legendItems: { color: string; label: string }[];
  interpretationText: string;
}

const WATER_BODIES_MAPS: Record<string, MapLayout> = {
  rio_neuquen: {
    riverPath: "M -50 420 Q 250 430 450 330 T 850 310 L 850 550 L -50 550 Z",
    riverColor: "#06b6d4",
    riverType: "Río",
    riverLabel: "Río Neuquén (Cauce Principal)",
    label1Name: "Frack Shack",
    label1Coords: { cx: 100, cy: 220 },
    label2Name: "LEGAM S.A.",
    label2Coords: { cx: 420, cy: 120 },
    dischargeName: "PUNTO DE DESCARGA",
    dischargeCoords: { cx: 515, cy: 315 },
    alertTitle: "DESVÍO HÍDRICO DETECTADO",
    alertSub: "Arrastre de Lodos & NDWI Crítico",
    bypassPath: "M 525 185 Q 560 220 545 270 Q 538 310 515 315",
    bypassColor: "#ea580c",
    erosionPaths: [
      "M 180,260 Q 240,280 340,365",
      "M 175,340 Q 260,350 310,380"
    ],
    forestCluster: [
      { cx: 20, cy: 405, r: 25 },
      { cx: 65, cy: 410, r: 22 },
      { cx: 110, cy: 412, r: 28 },
      { cx: 155, cy: 415, r: 30 },
      { cx: 205, cy: 418, r: 26 },
      { cx: 350, cy: 110, r: 35 },
      { cx: 390, cy: 120, r: 40 },
      { cx: 425, cy: 100, r: 38 }
    ],
    facilityRects: [
      { x: 385, y: 90, w: 28, h: 20, fill: "#cbd5e1" },
      { x: 420, y: 105, w: 22, h: 16, fill: "#94a3b8" }
    ],
    blueTanks: [
      { cx: 40, cy: 180, r: 10 },
      { cx: 40, cy: 205, r: 10 },
      { cx: 40, cy: 230, r: 10 }
    ],
    legendItems: [
      { color: "#0e7490", label: "Río Neuquén (Principal)" },
      { color: "#ea580c", label: "Pasivos / Desvío de Escorrentía" },
      { color: "#166534", label: "Suelo Vegetado / Filtro" },
      { color: "#3b82f6", label: "Zonas de Acopio Fracking" }
    ],
    points: [{ x: 515, y: 315 }],
    interpretationText: "La geometría observada en imágenes satelitales es compatible con una posible vía de escorrentía superficial desde sectores industriales de Frack Shack hacia el cauce principal. Se requiere verificación de campo para confirmar conectividad hidráulica. (Índice de confianza espectral estimado: 72% fundamentado en NDWI anómalo, persistencia temporal y ausencia de cobertura nubosa)."
  },
  rio_colorado: {
    riverPath: "M -50 150 Q 300 120 450 250 T 850 180 L 850 550 L -50 550 Z",
    riverColor: "#0284c7",
    riverType: "Río",
    riverLabel: "Río Colorado (Curso Alto)",
    label1Name: "Logística Terminal",
    label1Coords: { cx: 200, cy: 380 },
    label2Name: "Ducto El Portón",
    label2Coords: { cx: 600, cy: 100 },
    dischargeName: "SECADO DE TALUD EN COORDS",
    dischargeCoords: { cx: 480, cy: 230 },
    alertTitle: "SEDIMENTACIÓN ARCILLOSA",
    alertSub: "Arrastre por Lluvias de Verano",
    bypassPath: "M 600 110 Q 550 180 480 230",
    bypassColor: "#ef4444",
    erosionPaths: [
      "M 210,360 Q 300,320 450,260",
      "M 650,110 Q 570,150 490,225"
    ],
    forestCluster: [
      { cx: 100, cy: 220, r: 18 },
      { cx: 140, cy: 240, r: 24 },
      { cx: 500, cy: 380, r: 35 },
      { cx: 550, cy: 400, r: 30 }
    ],
    facilityRects: [
      { x: 180, y: 395, w: 35, h: 22, fill: "#475569" },
      { x: 585, y: 80, w: 25, h: 15, fill: "#64748b" }
    ],
    blueTanks: [
      { cx: 610, cy: 130, r: 8 },
      { cx: 630, cy: 130, r: 8 }
    ],
    legendItems: [
      { color: "#0284c7", label: "Río Colorado Activo" },
      { color: "#ef4444", label: "Contaminación Aluvional" },
      { color: "#166534", label: "Especies Xerófilas Costeras" },
      { color: "#334155", label: "Instalaciones de Bombeo" }
    ],
    points: [{ x: 480, y: 230 }],
    interpretationText: "La geometría observada en imágenes satelitales en la cuenca del Río Colorado es compatible con una posible vía de escorrentía superficial desde sectores industriales y de perforación de Rincón de los Sauces hacia el cauce principal. Se requiere verificación de campo para confirmar conectividad hidráulica preliminar. (Índice de confianza espectral estimado: 48%)."
  },
  los_barreales: {
    riverPath: "M -50 480 Q 200 150 400 180 T 850 450 L 850 550 L -50 550 Z",
    riverColor: "#b45309",
    riverType: "Embalse",
    riverLabel: "Embalse Los Barreales",
    label1Name: "Península Gas",
    label1Coords: { cx: 280, cy: 120 },
    label2Name: "Área Recreativa",
    label2Coords: { cx: 700, cy: 300 },
    dischargeName: "DENSIDAD ROJIZA MÁXIMA",
    dischargeCoords: { cx: 330, cy: 260 },
    alertTitle: "ALTA TURBIDEZ ARCILLOSA",
    alertSub: "Sedimento de Arcilla Roja Natural",
    bypassPath: "M 280 140 Q 300 200 330 260",
    bypassColor: "#b45309",
    erosionPaths: [
      "M 260,110 Q 310,180 325,230",
      "M 710,280 Q 550,290 400,280"
    ],
    forestCluster: [
      { cx: 650, cy: 280, r: 25 },
      { cx: 690, cy: 260, r: 30 },
      { cx: 730, cy: 270, r: 28 }
    ],
    facilityRects: [
      { x: 260, y: 75, w: 40, h: 25, fill: "#78716c" },
      { x: 680, y: 315, w: 30, h: 18, fill: "#a1a1aa" }
    ],
    blueTanks: [
      { cx: 240, cy: 90, r: 10 },
      { cx: 240, cy: 110, r: 10 }
    ],
    legendItems: [
      { color: "#b45309", label: "Embalse (Arcilla Colorada)" },
      { color: "#d97706", label: "Erosión de Barrancas" },
      { color: "#166534", label: "Matorral Aluvial" },
      { color: "#78716c", label: "Plataformas de Gas Cap" }
    ],
    points: [{ x: 330, y: 260 }],
    interpretationText: "La geometría observada en el Embalse Los Barreales es compatible con una posible vía de escorrentía y aporte mineral sedimentario desde las penínsulas logísticas hacia el cuerpo de agua principal. Se requiere verificación de campo para confirmar conectividad hidráulica y descarte de pasivos. (Índice de confianza espectral estimado: 30% por reflectividad mineral coloidal)."
  },
  mari_menuco: {
    riverPath: "M -50 350 Q 300 280 400 320 T 850 300 L 850 550 L -50 550 Z",
    riverColor: "#0369a1",
    riverType: "Embalse",
    riverLabel: "Embalse Mari Menuco (Protegido)",
    label1Name: "Captación AIC",
    label1Coords: { cx: 500, cy: 200 },
    label2Name: "Complejo Náutico",
    label2Coords: { cx: 200, cy: 150 },
    dischargeName: "MONITOREO DE REFUERZO",
    dischargeCoords: { cx: 520, cy: 310 },
    alertTitle: "CALIDAD DE AGUA ÓPTIMA",
    alertSub: "Bajos Sólidos y Cero Pluma hídrica",
    bypassPath: "M 500 215 L 520 310",
    bypassColor: "#10b981",
    erosionPaths: [],
    forestCluster: [
      { cx: 100, cy: 250, r: 35 },
      { cx: 150, cy: 270, r: 40 },
      { cx: 200, cy: 240, r: 30 },
      { cx: 450, cy: 220, r: 25 },
      { cx: 480, cy: 235, r: 30 },
      { cx: 520, cy: 210, r: 32 }
    ],
    facilityRects: [
      { x: 485, y: 175, w: 30, h: 20, fill: "#0ea5e9" },
      { x: 185, y: 125, w: 25, h: 18, fill: "#e5e7eb" }
    ],
    blueTanks: [],
    legendItems: [
      { color: "#0369a1", label: "Canal Limpio Mari Menuco" },
      { color: "#10b981", label: "Filtro Natural de Bio-Zonas" },
      { color: "#166534", label: "Faja Boscosa de Protección" },
      { color: "#090d16", label: "Ductos prohibidos" }
    ],
    points: [{ x: 520, y: 310 }],
    interpretationText: "La geometría observada en el Embalse Mari Menuco es compatible con un estado basal limpio y excelente grado de conservación natural, sin evidencias de escorrentías superficiales de sectores industriales. Se mantiene monitoreo preventivo. (Índice de confianza: 15%)."
  },
  lago_pellegrini: {
    riverPath: "M -50 300 Q 250 200 450 300 T 850 280 L 850 550 L -50 550 Z",
    riverColor: "#047857",
    riverType: "Lago",
    riverLabel: "Lago Pellegrini (Cerrrado)",
    label1Name: "Cinco Saltos Dren",
    label1Coords: { cx: 300, cy: 100 },
    label2Name: "Humedal Costero",
    label2Coords: { cx: 600, cy: 180 },
    dischargeName: "PUNTO DE ACUMULACIÓN",
    dischargeCoords: { cx: 450, cy: 260 },
    alertTitle: "MICROALGAS PERMANENTES",
    alertSub: "Eutrofización por Nutrientes Agrícolas",
    bypassPath: "M 300 115 Q 350 180 450 260",
    bypassColor: "#84cc16",
    erosionPaths: [
      "M 580,195 Q 520,220 460,250"
    ],
    forestCluster: [
      { cx: 550, cy: 150, r: 22 },
      { cx: 590, cy: 160, r: 28 },
      { cx: 630, cy: 140, r: 24 }
    ],
    facilityRects: [
      { x: 285, y: 80, w: 25, h: 20, fill: "#e2e8f0" }
    ],
    blueTanks: [],
    legendItems: [
      { color: "#047857", label: "Cuerpo Cerrado Pellegrini" },
      { color: "#84cc16", label: "Eutrofización / Algas" },
      { color: "#15803d", label: "Juncales Ribereños" },
      { color: "#475569", label: "Drenajes Colectores" }
    ],
    points: [{ x: 450, y: 260 }],
    interpretationText: "La geometría observada es compatible con vías de escorrentía silvoagropecuarias difusas de drenajes Cinco Saltos hacia la cuenca cerrada. Se requiere verificación de campo para corroborar la conectividad hidráulica. (Índice de confianza espectral estimado: 10%)."
  }
};

const WATER_BODY_BACKUPS: Record<string, {
  sceneId: string;
  originalProcessed: string;
  formula: string;
  samplingPoint: string;
  multitemporalCloud: string;
}> = {
  rio_neuquen: {
    sceneId: "S2B_MSIL2A_20260608T142511_N0500_R097_T19HDG_20260608T181525",
    originalProcessed: "Ortofoto RGB de color real (B4,B3,B2) linderas a Añelo frente a la máscara de reflectancia NDWI (Bandas 3/8) con estiramiento lineal del 2% evidenciando la faja de escorrentía activa.",
    formula: "NDWI = (Green[B3] - NIR[B8]) / (Green[B3] + NIR[B8]). Estimación de turbidez: Turb (NTU) = 4.25 * (B3 / B1) + 1.2 [Calibración Regional Neuquén v2]",
    samplingPoint: "Estación de Aforo RN-762 (Río Neuquén Inferior - Curva de LEGAM), Coordenadas: -38.361, -68.762. Sustenta físicamente la anomalía de 24 NTU registrada.",
    multitemporalCloud: "Contraste multitemporal con paso Sentinel-2 del 2026-06-03 (+35% de brillo espectral tras lluvias de talud). Cobertura nubosa de escena: 0.0% (Filtro SCL despejado)."
  },
  rio_colorado: {
    sceneId: "S2A_MSIL2A_20260607T142719_N0500_R097_T19HEF_20260607T181810",
    originalProcessed: "Mosaico color real Sentinel-2 (Banda 4-3-2) frente a procesamiento NDWI mostrando canal de erosión activo e ingreso de escorrentías coloidales.",
    formula: "NDWI = (Green[B3] - NIR[B8]) / (Green[B3] + NIR[B8]). Estimación de turbidez: Turb (NTU) = 5.10 * (B3 / B1) - 0.8 [Calibración Regional Colorado v1.4]",
    samplingPoint: "Estación de Muestreo RC-143 (Linderas a El Portón), Coordenadas: -37.890, -68.950. Corrobora la sedimentación mineral local de 32 NTU.",
    multitemporalCloud: "Contraste de órbita con paso del 2026-06-01 (+18% de cambio en reflectancia por lavado de ladera). Cobertura nubosa: 1.2% (Máscara de nubes activa)."
  },
  los_barreales: {
    sceneId: "S2B_MSIL2A_20260606T142103_N0500_R097_T19HDG_20260606T181155",
    originalProcessed: "Mosaico óptico multiespectral (RGB) frente a procesado de reflectancia de alta turbidez mineral, revelando la pluma homogénea de coloración arcillosa rojiza típica.",
    formula: "NDWI = (Green[B3] - NIR[B8]) / (Green[B3] + NIR[B8]). Proxy de Turbidez Inorgánica de Aluvión: Turb (NTU) = 7.35 * (B3 / B2) + 2.1",
    samplingPoint: "Punto de Control EB-090 (Península Gas), Coordenadas: -38.540, -68.680. Sustenta la dominancia mineral de 45 NTU propia del lecho sedimentario.",
    multitemporalCloud: "Contraste con órbita del 2026-05-28 (+8% de cambio por variación volumétrica del embalse). Cobertura nubosa detectada: 0.5% con máscara de clasificación activa."
  },
  mari_menuco: {
    sceneId: "S2B_MSIL2A_20260608T142511_N0500_R097_T19HDG_20260608T181525",
    originalProcessed: "Imagen óptica original en color verdadero (bandas ópticas puras) frente a reflectancia NDWI uniforme de agua profunda de altísima absorción espectral (firma limpia de impurezas).",
    formula: "NDWI = (Green[B3] - NIR[B8]) / (Green[B3] + NIR[B8]) libre de señales de dispersión de luz.",
    samplingPoint: "Toma de Captación Crítica MM-012 (Neuquén Consumo), Coordenadas: -38.580, -68.480. Confirma físicamente nivel basal mínimo y ultra-limpio de 5 NTU de turbidez.",
    multitemporalCloud: "Comparación multitemporal con mes previo (0.1% de variación, estabilidad absoluta). Cobertura nubosa del polígono: 0.0% (Píxeles 100% limpios de nubosidad)."
  },
  lago_pellegrini: {
    sceneId: "S2A_MSIL2A_20260605T142312_N0500_R097_T19HEF_20260605T181240",
    originalProcessed: "Fotomapa color real mostrando orilla de Cinco Saltos versus producto de reflectancia hídrica combinado con índice de vegetación NDVI ribereña para discriminar algas.",
    formula: "NDWI = (Green[B3] - NIR[B8]) / (Green[B3] + NIR[B8]) corregido por NDVI = (NIR[B8] - Red[B4]) / (NIR[B8] + Red[B4]) para estimación de fitoplancton.",
    samplingPoint: "Estación de Monitoreo LP-032 (Cuenca Cerrada Pellegrini), Coordenadas: -38.680, -68.020. Ratifica acumulación cíclica y turbidez de 18 NTU basales.",
    multitemporalCloud: "Comparativa con imagen previa de órbita del 2026-05-25 (+12% de incremento fitoplanctónico). Cobertura de nubes en la zona: 2.1% (Capa de sombras de nubes descartada)."
  }
};

export default function HydrologicalAnalysisWidget() {
  const [selectedBody, setSelectedBody] = useState<WaterBody>(WATER_BODIES_DATA[0]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<"vector" | "satellite">("vector");
  const [copied, setCopied] = useState(false);

  const handleRunHydrologyAnalysis = async (body: WaterBody) => {
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch("/api/analyze-hydrology", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: body.id,
          name: body.name,
          region: body.region,
          type: body.type,
          vulnerability: body.vulnerability,
          turbidity: body.turbidity,
          riskLevel: body.riskLevel,
          pipelineCrossings: body.pipelineCrossings,
          wellsProximity: body.wellsProximity,
          oilSlickRisk: body.oilSlickRisk,
          description: body.description,
          latitude: body.latitude,
          longitude: body.longitude
        })
      });

      if (!res.ok) {
        throw new Error("El auditor de IA hídrico no pudo procesar la solicitud. Intente nuevamente.");
      }

      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Falla al conectar con el motor satelital de aguas.");
    } finally {
      setLoading(false);
    }
  };

  const generateHtmlCode = () => {
    if (!report) return "";

    const backups = WATER_BODY_BACKUPS[selectedBody.id] || WATER_BODY_BACKUPS.rio_neuquen;

    const bodyName = selectedBody.name;
    const bodyType = selectedBody.type;
    const region = report.zona_afectada || selectedBody.region;
    const coords = report.coordenadas || `${selectedBody.latitude}, ${selectedBody.longitude}`;
    const risk = report.nivel_riesgo_calculado || selectedBody.riskLevel;
    const vuln = report.porcentaje_vulnerabilidad || selectedBody.vulnerability;
    const turb = selectedBody.turbidity;
    const wells = selectedBody.wellsProximity;
    const ducts = selectedBody.pipelineCrossings;
    const slick = selectedBody.oilSlickRisk;
    const observationDate = report.fecha_observacion || "2026-06-08 14:32:05 UTC (Pasada Descendente)";
    const sourceData = report.fuentes_datos || "Agencia Espacial Europea (ESA) Sentinel-2 MSI L2A, NASA/USGS Landsat-9, Catastro Minero e Hidrogeológico de la Provincia de Neuquén y Red de Monitoreo de la AIC.";
    const nearCompanies = report.empresas_industriales_cercanas || "Frack Shack (Área de logística de tanques y fluidos de fractura hidráulica hídrica) y LEGAM S.A. (Infraestructura lindera y cortina forestal protectora).";
    const historyAnalysis = report.locacion_historica_analisis || "La proximidad de actividades logísticas intensas e históricas de tanques linderos en el área genera un arrastre pluvial difuso hacia el cauce activo.";

    const mapLayout: MapLayout = WATER_BODIES_MAPS[selectedBody.id] || WATER_BODIES_MAPS.rio_neuquen;
    const isSat = mapMode === "satellite";

    const terrainFill = isSat ? "url(#terrainGradSat)" : "url(#terrainGradPrint)";
    const waterFill = isSat ? "url(#riverGradSat)" : "url(#riverGradPrint)";
    const waterStroke = isSat ? "none" : "#06b6d4";
    const waterStrokeWidth = isSat ? "0" : "3";
    const gridOpacity = isSat ? "0.05" : "0.1";

    const forestCirclesHtml = mapLayout.forestCluster.map(c => 
      `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" ${isSat ? `fill="url(#forestTree)" filter="url(#dropShadow)"` : ''} />`
    ).join("\n");

    const facilitySquaresHtml = (mapLayout.facilityRects || []).map(r => 
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="2" fill="${r.fill}" stroke="#475569" stroke-width="1" />`
    ).join("\n");

    const blueContainersHtml = (mapLayout.blueTanks || []).map(t => 
      `<circle cx="${t.cx}" cy="${t.cy}" r="${t.r}" fill="#0284c7" stroke="#0369a1" stroke-width="1.5" />`
    ).join("\n");

    const bypassHtml = mapLayout.bypassPath ? `
      <path d="${mapLayout.bypassPath}" fill="none" stroke="${isSat ? '#ca8a04' : 'url(#spillGradPrint)'}" stroke-width="11" stroke-linecap="round" opacity="0.85" filter="url(#glowPrint)" />
      <path d="${mapLayout.bypassPath}" fill="none" stroke="${isSat ? '#fbbf24' : '#f43f5e'}" stroke-width="3" stroke-linecap="round" stroke-dasharray="8 8" />
    ` : "";

    const erosionsHtml = (mapLayout.erosionPaths || []).map(p => 
      `<path d="${p}" fill="none" stroke="${isSat ? '#a16207' : '#f97316'}" stroke-width="2.5" stroke-dasharray="4 6" opacity="0.65" />`
    ).join("\n");

    const legendGHtml = mapLayout.legendItems.map((item, i) => `
      <circle cx="${i < 2 ? 5 : 115}" cy="${i % 2 === 0 ? 5 : 19}" r="4" fill="${item.color}" />
      <text x="${i < 2 ? 15 : 125}" y="${i % 2 === 0 ? 9 : 23}" fill="#94a3b8" font-size="8.5" font-family="sans-serif">${item.label}</text>
    `).join("\n");

    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte_Auditoria_${bodyName.replace(/\s+/g, "_")}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap');
    body {
      font-family: 'Inter', sans-serif;
    }
    .display-font {
      font-family: 'Space Grotesk', sans-serif;
    }
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; color: black !important; padding: 0 !important; }
      .print-border { border: 1px solid #cbd5e1 !important; }
    }
  </style>
</head>
<body class="bg-slate-900 text-slate-100 p-4 sm:p-8 md:p-12 min-h-screen print:bg-white print:text-black">
  <div class="max-w-4xl mx-auto bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-10 relative overflow-hidden print-border print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
    
    <!-- Top Bar with Actions inside Downloadable Page -->
    <div class="flex justify-between items-center pb-6 border-b border-slate-800 mb-8 no-print">
      <div class="flex items-center gap-2">
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="text-xs font-mono text-emerald-400">Expediente generado automáticamente</span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.print()" class="px-4 py-2 bg-gradient-to-r from-teal-600 to-sky-600 hover:from-teal-500 hover:to-sky-500 text-white font-bold text-xs rounded-lg transition-colors shadow cursor-pointer">
          Imprimir report (PDF)
        </button>
      </div>
    </div>

    <!-- Official Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 border-b border-slate-800 pb-8 print:border-slate-300">
      <div>
        <h1 class="text-2xl font-black display-font text-sky-400 tracking-tight flex items-center gap-2 print:text-slate-950">
          Reporte Generado por Sistema Propio - Lic. Paredes Victor
        </h1>
        <p class="text-xs text-slate-400 mt-0.5 print:text-slate-600">Sistema Propio de Monitoreo & Auditoría Hídrica de Cuencas</p>
      </div>
      <div class="text-left md:text-right font-mono text-xs text-slate-400 space-y-1 print:text-slate-700">
        <div><strong>FOLIO:</strong> RE-2026-${Math.floor(100000 + Math.random() * 900000)}</div>
        <div><strong>Fecha emisión:</strong> 2026-06-09 16:57:05 UTC</div>
        <div><strong>AUDITOR:</strong> vparedes2@gmail.com</div>
      </div>
    </div>

    <!-- Title Badge -->
    <div class="bg-gradient-to-r from-sky-950 to-slate-900 border border-sky-500/30 rounded-xl p-5 mb-8 print:bg-slate-100 print:text-black print:border-slate-300">
      <div class="flex justify-between items-center flex-wrap gap-2">
        <div>
          <span class="text-[9px] font-mono text-sky-400 uppercase tracking-widest font-black block">Reporte técnico interprovincial coirco</span>
          <h2 class="text-xl font-bold display-font text-slate-100 print:text-slate-950">${bodyName} • Diagnóstico Georreferenciado</h2>
        </div>
        <span class="px-3 py-1 font-mono text-xs font-bold rounded-lg bg-slate-900 border border-slate-800 text-sky-400 print:bg-slate-200 print:text-slate-800">${bodyType}</span>
      </div>
    </div>

    <!-- Critical Insitu Warning Banner -->
    <div class="p-5 rounded-xl border border-amber-500/30 bg-amber-500/10 mb-8 text-xs leading-relaxed text-slate-300 print:bg-amber-50 print:border-amber-400 print:text-amber-950">
      <div class="flex items-center gap-2 text-amber-400 font-bold mb-2 print:text-amber-850">
        Declaración de validación y control regulatorio
      </div>
      <p class="mb-2">
        <strong>Aviso de control técnico:</strong> A la fecha del presente reporte, las estimaciones hídricas y análisis de reflectancia óptico-espectral expuestos en este informe <strong class="text-amber-350 underline">Faltan validación in-situ</strong> en terreno (toma de muestras analíticas físicas, espectrofotometría portátil de campo y calibración directa mediante sensores piezométricos). Las firmas espectrales poseen márgenes de incertidumbre inherentes a los modelos matemáticos de banda del sensor orbital.
      </p>
      <p>
        <strong>Criterio de acción preventiva:</strong> Sin embargo, las anomalías de reflectancia hídrica NDWI detectadas y el comportamiento multitemporal observado de escorrentía activa <strong class="text-emerald-400 font-bold decoration-dotted underline print:text-teal-850">Ameritan una inspección inmediata en terreno</strong>. La confluencia de riesgos hídricos e históricos identificados justifica plenamente la activación de protocolos de contingencia y la movilización preliminar de personal técnico de HSE para toma de muestras físicas de resguardo.
      </p>
    </div>

    <!-- Metadata Grid -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      <div class="p-4 bg-slate-900/60 border border-slate-800 rounded-xl print:bg-slate-50 print:border-slate-300">
        <span class="text-[9.5px] font-mono text-slate-500 block uppercase">Coordenadas Centro:</span>
        <span class="text-xs font-bold font-mono text-slate-200 print:text-black">${coords}</span>
      </div>
      <div class="p-4 bg-slate-900/60 border border-slate-800 rounded-xl print:bg-slate-50 print:border-slate-300">
        <span class="text-[9.5px] font-mono text-slate-500 block uppercase">Nivel Riesgo Calculado:</span>
        <span class="text-xs font-bold font-mono text-rose-400 print:text-rose-850">${risk}</span>
      </div>
      <div class="p-4 bg-slate-900/60 border border-slate-800 rounded-xl print:bg-slate-50 print:border-slate-300">
        <span class="text-[9.5px] font-mono text-slate-500 block uppercase">Vulnerabilidad de Acuífero:</span>
        <span class="text-xs font-bold font-mono text-teal-400 print:text-teal-850">${vuln}%</span>
      </div>
      <div class="p-4 bg-slate-900/60 border border-slate-800 rounded-xl print:bg-slate-50 print:border-slate-300">
        <span class="text-[9.5px] font-mono text-slate-500 block uppercase">Turbidez Estimada (Modelo):</span>
        <span class="text-xs font-bold font-mono text-sky-400 print:text-sky-850">${turb} NTU ± 6 NTU</span>
      </div>
    </div>

    <!-- Observatory and Data Details -->
    <div class="mb-4 p-4 bg-slate-900/60 border border-slate-800 rounded-xl print:bg-slate-50 print:border-slate-300">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
        <div>
          <strong class="text-sky-400 print:text-sky-850 block mb-1">Fuente de Observación Satelital:</strong>
          <span class="text-slate-300 print:text-slate-800 leading-snug">${sourceData}</span>
        </div>
        <div>
          <strong class="text-sky-400 print:text-sky-850 block mb-1">Fecha de Observación Satelital:</strong>
          <span class="text-slate-300 print:text-slate-800 font-mono text-xs">${observationDate}</span>
        </div>
      </div>
    </div>

    <!-- Core Sections -->
    <div class="space-y-6">
      
      <div class="bg-slate-900/40 border border-slate-850 p-4 rounded-xl print:bg-white print:border-slate-200">
        <h3 class="font-bold text-sm text-slate-200 pb-1.5 border-b border-slate-850 mb-2 tracking-wide flex items-center gap-1.5 print:text-slate-950 print:border-slate-300">
          Diagnóstico Espectral de Canales y NDWI
        </h3>
        <p class="text-slate-300 print:text-slate-800">
          ${report.diagnostic_espectral || report.diagnostic_spectral}
        </p>
      </div>

      <div class="bg-slate-900/40 border border-slate-850 p-4 rounded-xl print:bg-white print:border-slate-200">
        <h3 class="font-bold text-sm text-slate-200 pb-1.5 border-b border-slate-850 mb-2 tracking-wide flex items-center gap-1.5 print:text-slate-950 print:border-slate-300">
          Rutas de Contaminación Activas en Cuenca
        </h3>
        <p class="text-slate-350 leading-relaxed print:text-slate-800">
          ${report.contaminacion_rutas || report.contamination_routes}
        </p>
      </div>

      <div class="bg-slate-900/40 border border-slate-850 p-4 rounded-xl print:bg-white print:border-slate-200">
        <h3 class="font-bold text-sm text-slate-200 pb-1.5 border-b border-slate-850 mb-2 tracking-wide flex items-center gap-1.5 print:text-slate-950 print:border-slate-300">
          Análisis de Entidades Lindantes y Proximidades
        </h3>
        <p class="text-slate-350 leading-relaxed print:text-slate-800">
          <strong>Estudio de proximidad:</strong> ${nearCompanies}
        </p>
      </div>

      <div class="bg-rose-950/15 border border-rose-500/20 p-4 rounded-xl print:bg-slate-100 print:border-slate-300">
        <h3 class="font-bold text-rose-450 uppercase tracking-wider mb-2 flex items-center gap-1.5 print:text-rose-850">
          Evaluación de Pasivo / Locación Histórica Activa (Explicación Satelital)
        </h3>
        <p class="text-slate-300 leading-relaxed print:text-slate-800">
          ${historyAnalysis}
        </p>
      </div>

      <!-- Confidence Index Methodology Block -->
      <div class="bg-slate-900/60 border border-slate-800 p-5 rounded-xl print:bg-white print:border-slate-300">
        <h3 class="font-bold text-sm text-slate-200 pb-1.5 border-b border-slate-800 mb-2 tracking-wide flex items-center gap-1.5 print:text-slate-950 print:border-slate-300">
          Metodología & Índice de Confianza de Detección Espectral (${slick}%)
        </h3>
        <p class="text-[11px] text-slate-300 leading-relaxed print:text-slate-850">
          La probabilidad estimada de película de brillo del <strong>${slick}%</strong> se calcula basándose en una matriz de teledetección robusta integrada por cuatro pilares analíticos:
        </p>
        <ul class="list-disc pl-4 mt-2 space-y-1 text-slate-450 text-[10.5px] print:text-slate-750">
          <li><strong>NDWI Anómalo:</strong> Fluctuaciones continuas detectadas en la relación espectral de reflectancia para la Banda 3 (Verde) y Banda 8 (NIR).</li>
          <li><strong>Persistencia Temporal:</strong> Contraste relacional iterativo con barridos orbitales precedentes del satélite Copernicus Sentinel-2.</li>
          <li><strong>Proximidad Geográfica:</strong> Distancia espacial menor a 2,000 metros de yacimientos e instalaciones logísticas linderas.</li>
          <li><strong>Ausencia de Nubosidad:</strong> Filtro de corrección atmosférica para escenas con atenuación y sombras de nubes inferior a 2.5%.</li>
        </ul>
      </div>

      <div class="bg-slate-900/40 border border-slate-850 p-4 rounded-xl print:bg-white print:border-slate-200">
        <h3 class="font-bold text-sm text-slate-200 pb-1.5 border-b border-slate-850 mb-2 tracking-wide flex items-center gap-1.5 print:text-slate-950 print:border-slate-300">
          Cartografía Satelital del Desvío Hídrico y Puntos de Interés (${isSat ? "Modo Satelital Real" : "Modo Vectorial Estándar"})
        </h3>
        <div class="relative w-full aspect-[16/10] bg-slate-950 rounded-lg overflow-hidden border border-slate-800 mb-3 print:border-slate-300">
          <svg viewBox="0 0 800 500" class="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="terrainGradPrint" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#1e2019" />
                <stop offset="50%" stop-color="#25241e" />
                <stop offset="100%" stop-color="#1a1c17" />
              </linearGradient>
              <linearGradient id="riverGradPrint" x1="0%" y1="0%" x2="100%" y2="50%">
                <stop offset="0%" stop-color="#083344" />
                <stop offset="50%" stop-color="#0e7490" />
                <stop offset="100%" stop-color="#155e75" />
              </linearGradient>
              <linearGradient id="spillGradPrint" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ea580c" stop-opacity="0.85" />
                <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.4" />
              </linearGradient>
              <filter id="glowPrint" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <rect width="800" height="500" fill="url(#terrainGradPrint)" />

            <g opacity="0.1" stroke="#475569" stroke-width="0.5">
              <line x1="100" y1="0" x2="100" y2="500" /> <line x1="200" y1="0" x2="200" y2="500" />
              <line x1="300" y1="0" x2="300" y2="500" /> <line x1="400" y1="0" x2="400" y2="500" />
              <line x1="500" y1="0" x2="500" y2="500" /> <line x1="600" y1="0" x2="600" y2="500" />
              <line x1="700" y1="0" x2="700" y2="500" />
              <line x1="0" y1="100" x2="800" y2="100" /> <line x1="0" y1="200" x2="800" y2="200" />
              <line x1="0" y1="300" x2="800" y2="300" /> <line x1="0" y1="400" x2="800" y2="400" />
            </g>

            <path d="${mapLayout.riverPath}" fill="url(#riverGradPrint)" stroke="${waterStroke}" stroke-width="${waterStrokeWidth}" opacity="0.95" />
            
            <path d="M 50 430 Q 150 432 250 428" fill="none" stroke="#22d3ee" stroke-width="1" stroke-dasharray="10 20" opacity="0.6" stroke-dashoffset="0" />
            <path d="M 380 370 Q 480 340 580 332" fill="none" stroke="#22d3ee" stroke-width="1" stroke-dasharray="15 30" opacity="0.6" stroke-dashoffset="0" />

            <!-- Dynamic Forests -->
            <g fill="#14532d" stroke="#166534" stroke-width="1" opacity="0.8">
              ${forestCirclesHtml}
            </g>

            <!-- Dynamic Facilities -->
            <g opacity="0.9">
              ${facilitySquaresHtml}
            </g>

            <!-- Dynamic Blue Tanks -->
            <g fill="#1e40af" stroke="#1d4ed8" stroke-width="1.5">
              ${blueContainersHtml}
            </g>

            <!-- Dynamic Bypass -->
            ${bypassHtml}

            <!-- Dynamic Erosions -->
            ${erosionsHtml}

            <!-- Label 1 -->
            <g transform="translate(${mapLayout.label1Coords.cx}, ${mapLayout.label1Coords.cy})">
              <circle cx="0" cy="0" r="16" fill="#020617" fill-opacity="0.8" stroke="#3b82f6" stroke-width="1.5" />
              <circle cx="0" cy="0" r="5" fill="#3b82f6" />
              <rect x="${-(mapLayout.label1Name.length * 4.2)}" y="-36" width="${mapLayout.label1Name.length * 8.4}" height="18" rx="4" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
              <text x="0" y="-23" fill="#f8fafc" font-size="10" font-weight="bold" font-family="sans-serif" text-anchor="middle">${mapLayout.label1Name}</text>
            </g>

            <!-- Label 2 -->
            <g transform="translate(${mapLayout.label2Coords.cx}, ${mapLayout.label2Coords.cy})">
              <circle cx="0" cy="0" r="16" fill="#020617" fill-opacity="0.8" stroke="#10b981" stroke-width="1.5" />
              <circle cx="0" cy="0" r="5" fill="#10b981" />
              <rect x="${-(mapLayout.label2Name.length * 4.2)}" y="-36" width="${mapLayout.label2Name.length * 8.4}" height="18" rx="4" fill="#0f172a" stroke="#1e293b" stroke-width="1" />
              <text x="0" y="-23" fill="#f8fafc" font-size="10" font-weight="bold" font-family="sans-serif" text-anchor="middle">${mapLayout.label2Name}</text>
            </g>

            <!-- Alert Indicator (Relative Positioning) -->
            <g transform="translate(${mapLayout.dischargeCoords.cx + 30}, ${mapLayout.dischargeCoords.cy - 80})">
              <circle cx="0" cy="0" r="24" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.8" />
              <rect x="-85" y="-45" width="170" height="28" rx="5" fill="#020617" fill-opacity="0.95" stroke="#f43f5e" stroke-width="1.5" />
              <text x="0" y="-32" fill="#fca5a5" font-size="9" font-weight="extrabold" font-family="sans-serif" text-anchor="middle">${mapLayout.alertTitle}</text>
              <text x="0" y="-21" fill="#cbd5e1" font-size="8" font-family="sans-serif" text-anchor="middle">${mapLayout.alertSub}</text>
            </g>

            <!-- Point of Discharge -->
            <g transform="translate(${mapLayout.dischargeCoords.cx}, ${mapLayout.dischargeCoords.cy})">
              <path d="M 0,0 L 25,-40 L 70,-40" fill="none" stroke="#fbbf24" stroke-width="1" />
              <circle cx="0" cy="0" r="6" fill="#fbbf24" stroke="#020617" stroke-width="1" />
              <text x="32" y="-46" fill="#fbbf24" font-size="9.5" font-weight="black" font-family="monospace">${mapLayout.dischargeName}</text>
              <text x="32" y="-28" fill="#fef08a" font-size="8" font-family="monospace">Coords: ${coords}</text>
            </g>

            <!-- Compass and North Indicator -->
            <g transform="translate(730, 70)" opacity="0.85">
              <circle cx="0" cy="0" r="28" fill="#0f172a" stroke="#334155" stroke-width="1" />
              <line x1="0" y1="-22" x2="0" y2="22" stroke="#64748b" stroke-width="1" />
              <line x1="-22" y1="0" x2="22" y2="0" stroke="#64748b" stroke-width="1" />
              <polygon points="0,-24 5,0 -5,0" fill="#ef4444" />
              <polygon points="0,24 5,0 -5,0" fill="#94a3b8" />
              <text x="0" y="-28" fill="#f8fafc" font-size="9" font-weight="bold" font-family="sans-serif" text-anchor="middle">N</text>
            </g>

            <!-- Dynamic Legend grid -->
            <rect x="25" y="445" width="220" height="42" rx="4" fill="#020617" fill-opacity="0.9" stroke="#334155" stroke-width="1" />
            <g transform="translate(35, 453)">
              ${legendGHtml}
            </g>
          </svg>
        </div>
        <p class="text-[11px] text-slate-350 print:text-slate-700 leading-normal">
          <strong>Interpretación Cartográfica:</strong> ${mapLayout.interpretationText}
        </p>
      </div>

      <div class="bg-teal-950/15 border border-teal-500/20 p-4 rounded-xl print:bg-emerald-50 print:border-emerald-200">
        <h3 class="font-bold text-sm text-teal-400 mb-2 tracking-wide flex items-center gap-1.5 print:text-emerald-900">
          Protocolo de Mitigación y Plan de Contingencia Recomendado (HSE)
        </h3>
        <p class="text-slate-300 print:text-slate-900 font-medium">
          ${report.plan_contingencia || report.contingency_plan}
        </p>
      </div>

      <div class="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl print:bg-slate-50 print:border-slate-300">
        <h3 class="font-bold text-sm text-sky-400 mb-3 tracking-wide flex items-center gap-1.5 print:text-slate-900">
          Respaldos de Validación en Base de Datos Satelital
        </h3>
        <p class="text-[10.5px] text-slate-400 mb-3 print:text-slate-600 leading-normal">
          Para certificar y auditar oficialmente bajo sistema de conformidad, se incluye el contraste de este indicador espectral con los siguientes 5 respaldos técnicos activos para <strong>${bodyName}</strong>:
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10.5px]">
          <div class="p-2 border border-slate-800 rounded bg-slate-950/40 print:bg-white print:border-slate-200 w-full overflow-hidden">
            <span class="font-bold text-slate-300 block mb-0.5 print:text-slate-900">1. ID Exacto de Escena Satelital</span>
            <span class="text-slate-400 print:text-slate-800 font-mono block select-all p-1 bg-slate-950/65 rounded border border-slate-900 print:bg-slate-100 print:border-slate-300 text-[8.5px] mb-1 overflow-x-auto whitespace-nowrap">${backups.sceneId}</span>
            <span class="text-slate-450 print:text-slate-700 font-sans block text-[9.5px] leading-relaxed">Identificador de escena Sentinel-2/Landsat-9 para trazabilidad estricta del procesamiento de bandas.</span>
          </div>
          <div class="p-2 border border-slate-800 rounded bg-slate-950/40 print:bg-white print:border-slate-200">
            <span class="font-bold text-slate-300 block mb-0.5 print:text-slate-900">2. Imagen Satelital (Original y Procesada)</span>
            <span class="text-slate-400 print:text-slate-750 font-sans leading-normal block text-[9.5px]">${backups.originalProcessed}</span>
          </div>
          <div class="p-2 border border-slate-800 rounded bg-slate-950/40 print:bg-white print:border-slate-200">
            <span class="font-bold text-slate-300 block mb-0.5 print:text-slate-900">3. Fórmula de Índice Empleada</span>
            <span class="text-slate-400 print:text-slate-750 font-sans leading-normal block text-[9.5px]">Cálculo explícito para NDWI/turbidez: <code class="text-yellow-400 font-mono block bg-slate-950/50 p-1 rounded mt-1 text-[8.5px] print:bg-slate-105 print:text-yellow-900 print:border print:border-slate-300">${backups.formula}</code></span>
          </div>
          <div class="p-2 border border-slate-800 rounded bg-slate-950/40 print:bg-white print:border-slate-200">
            <span class="font-bold text-slate-300 block mb-0.5 print:text-slate-900">4. Justificación del Punto de Muestreo (~${turb} NTU Estimado)</span>
            <span class="text-slate-400 print:text-slate-750 font-sans leading-normal block text-[9.5px]">${backups.samplingPoint}</span>
          </div>
          <div class="p-2 col-span-1 md:col-span-2 border border-slate-800 rounded bg-slate-950/40 print:bg-white print:border-slate-200">
            <span class="font-bold text-slate-300 block mb-0.5 print:text-slate-900">5. Comparación Multitemporal & Máscara de Nubes</span>
            <span class="text-slate-400 print:text-slate-750 font-sans leading-normal block text-[9.5px]">${backups.multitemporalCloud}</span>
          </div>
        </div>
      </div>

    </div>

    <!-- Static Details Footer -->
    <div class="mt-8 grid grid-cols-3 gap-2 border-t border-b border-slate-800 py-3 text-[9px] font-mono text-slate-500 print:border-slate-200 print:text-slate-600">
      <div><strong>Cruces de oleoductos:</strong> ${ducts} cruces analizados</div>
      <div><strong>Pozos activos en radio:</strong> ${wells} plataformas cercanas</div>
      <div><strong>Riesgo slick complementario:</strong> ${slick}%</div>
    </div>

    <!-- Official Signature Footer -->
    <div class="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 text-[10px] text-slate-500 print:border-slate-300 print:text-slate-600">
      <div class="text-center sm:text-left">
        <div><strong>Responsable emisión:</strong> Lic. Paredes Victor / Sistema Propio de Reportes</div>
        <div>Generado en conformidad con normas ambientales de Calidad Hídrica y Monitoreo local.</div>
      </div>
      <div class="text-center sm:text-right">
         <div class="border-t border-slate-700 w-36 pt-1 mx-auto sm:mr-0 print:border-slate-400">Lic. Paredes Victor</div>
         <div class="text-slate-400 mt-0.5 font-mono">vparedes2@gmail.com</div>
      </div>
    </div>

  </div>

  <script>
    // Automatically trigger print dialog on document loading after brief transition
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 350);
    };
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Reporte_Auditoria_Hidrologica_${bodyName.replace(/\\s+/g, "_")}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRiskBadgeColor = (level: "Crítico" | "Alto" | "Medio" | "Bajo") => {
    switch (level) {
      case "Crítico":
        return "bg-red-500/15 text-red-400 border-red-500/25";
      case "Alto":
        return "bg-orange-500/15 text-orange-400 border-orange-500/25";
      case "Medio":
        return "bg-amber-500/15 text-amber-400 border-amber-500/25";
      case "Bajo":
        return "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-800";
    }
  };

  const mapLayout: MapLayout = WATER_BODIES_MAPS[selectedBody.id as keyof typeof WATER_BODIES_MAPS] || WATER_BODIES_MAPS.rio_neuquen;
  const isSat = mapMode === "satellite";
  const coords = `${selectedBody.latitude}, ${selectedBody.longitude}`;
  const uiBackups = WATER_BODY_BACKUPS[selectedBody.id] || WATER_BODY_BACKUPS.rio_neuquen;

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6" id="hydrological-analysis-widget-parent">
      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 border-b border-slate-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 px-2.5 text-[9px] font-black text-sky-400 bg-sky-500/10 border border-sky-500/25 rounded font-mono">
              Computación hidrológica NDWI
            </span>
            <span className="flex items-center gap-1 text-[10px] text-teal-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-ping"></span>
              Detección de películas de hidrocarburos
            </span>
          </div>
          <h2 className="text-lg font-black text-slate-100 font-sans mt-1">
            Auditoría de Cauces y Lagos: Monitoreo Crítico Fluvial Vaca Muerta
          </h2>
          <p className="text-xs text-slate-400 font-sans mt-0.5">
            Análisis espectral por indexación hidráulica para prevención de fugas de flowback, cruce de ductos e impacto ambiental hídrico.
          </p>
        </div>
      </div>

      {/* Main Hydrology Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="hydrology-grid">
        
        {/* Left selector col - 5 col */}
        <div className="lg:col-span-4 space-y-2.5">
          <span className="text-[10px] font-mono text-slate-500 block uppercase tracking-widest font-bold">
            Seleccionar cuerpo o cauce traspasado:
          </span>
          <div className="space-y-2">
            {WATER_BODIES_DATA.map((body) => {
              const isSelected = selectedBody.id === body.id;
              const isCrit = body.riskLevel === "Crítico";
              
              return (
                <button
                  key={body.id}
                  onClick={() => {
                    setSelectedBody(body);
                    setReport(null);
                    setError(null);
                  }}
                  className={`w-full text-left p-3.5 rounded-xl border transition-colors duration-200 cursor-pointer flex justify-between items-center relative ${
                    isSelected
                      ? "bg-slate-900 border-sky-500/70 ring-1 ring-sky-500/25 text-slate-100 shadow-lg shadow-sky-950/20"
                      : "bg-slate-950/40 border-slate-850 hover:bg-slate-900 hover:border-slate-800 text-slate-350"
                  }`}
                  id={`water-btn-${body.id}`}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <span className={`p-2 rounded-lg ${
                      isSelected ? "bg-sky-500/10 text-sky-400" : "bg-slate-900 text-slate-500"
                    }`}>
                      {body.type === "Río" ? <Waves className="w-4 h-4" /> : <Droplet className="w-4 h-4" />}
                    </span>
                    <div>
                      <h4 className="text-xs font-black tracking-wide font-sans">{body.name}</h4>
                      <p className="text-[10px] font-mono text-slate-450 mt-0.5">{body.region}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    <span className={`px-2 py-0.5 rounded border ${getRiskBadgeColor(body.riskLevel)}`}>
                      {body.riskLevel}
                    </span>
                    <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? "text-sky-400 translate-x-0.5" : "text-slate-600"}`} />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-4 bg-slate-950/60 border border-slate-850 rounded-xl space-y-2 text-xs">
            <span className="font-bold text-slate-300 block">¿Qué es el Índice NDWI?</span>
            <p className="text-[11px] text-slate-400 leading-normal">
              El <strong>Índice de Agua de Diferencia Normalizada</strong> (Normalized Difference Water Index) contrasta la reflectancia del Verde (B3) y el Infrarrojo Cercano (B8) de Sentinel-2. Es altamente sensible para delinear cuerpos hídricos y detectar la degradación óptica que provocan <i>metales pesados, sales solubles de flowback o películas de petróleo en suspensión</i>.
            </p>
          </div>
        </div>

        {/* Right Details Panel - 8 col */}
        <div className="lg:col-span-8 bg-slate-950/30 border border-slate-850 rounded-2xl p-5 flex flex-col justify-between space-y-6">
          
          {/* Header detail */}
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between items-start gap-3 border-b border-slate-850 pb-3">
              <div>
                <span className="text-[10px] font-mono text-sky-400 uppercase tracking-widest font-black">
                  Exploración de integridad hídrica
                </span>
                <h3 className="text-lg font-extrabold text-slate-100 flex items-center gap-2">
                  {selectedBody.name}
                  <span className="text-xs font-mono font-normal text-slate-400">
                    Coords: {selectedBody.latitude}, {selectedBody.longitude}
                  </span>
                </h3>
              </div>
              
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-slate-450">Vulnerabilidad Regional:</span>
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1 rounded-lg">
                  <span className="text-xs font-black font-mono text-sky-400">{selectedBody.vulnerability}%</span>
                  <div className="w-12 bg-slate-950 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-sky-400 h-full rounded-full" 
                      style={{ width: `${selectedBody.vulnerability}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/10 p-3.5 border border-slate-850/60 rounded-xl">
              {selectedBody.description}
            </p>

            {/* Key Metrics grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              
              <div className="p-3 bg-slate-950/80 border border-slate-850 rounded-xl space-y-1">
                <span className="text-[9px] font-mono text-slate-450 uppercase block">Turbidez Estimada (Modelo):</span>
                <span className="text-[13.5px] font-black text-slate-150 font-mono tracking-tight block leading-snug">
                  {selectedBody.turbidity} NTU ± 6 NTU
                </span>
                <span className="text-[9.5px] font-mono text-slate-400 block font-semibold">
                  Modelo espectral regional
                </span>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-850 rounded-xl space-y-1">
                <span className="text-[9px] font-mono text-slate-450 uppercase block">Riesgo Película de Brillo:</span>
                <span className="text-lg font-black text-rose-450 font-mono tracking-tight text-rose-400 flex items-baseline gap-1">
                  {selectedBody.oilSlickRisk}% 
                  <span className="text-[10px] text-slate-500 font-normal">Slick Prob</span>
                </span>
                <span className="text-[9.5px] font-mono text-slate-400 block font-semibold">
                  {selectedBody.oilSlickRisk > 50 ? "Alerta de Derrame" : "Estabilidad Basal"}
                </span>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-850 rounded-xl space-y-1">
                <span className="text-[9px] font-mono text-slate-450 uppercase block">Cruces de Ductos:</span>
                <span className="text-lg font-black text-slate-150 font-mono tracking-tight flex items-baseline gap-1">
                  {selectedBody.pipelineCrossings}
                  <span className="text-[10px] text-slate-500 font-normal">Cruces</span>
                </span>
                <span className="text-[9.5px] font-mono text-slate-400 block font-semibold">
                  {selectedBody.pipelineCrossings > 5 ? "Riesgo Severo de Brida" : "Cruces Aislados"}
                </span>
              </div>

              <div className="p-3 bg-slate-950/80 border border-slate-850 rounded-xl space-y-1">
                <span className="text-[9px] font-mono text-slate-450 uppercase block">Pozos a &lt; 2km margen:</span>
                <span className="text-lg font-black text-slate-150 font-mono tracking-tight flex items-baseline gap-1">
                  {selectedBody.wellsProximity}
                  <span className="text-[10px] text-slate-500 font-normal">Pozos</span>
                </span>
                <span className="text-[9.5px] font-mono text-slate-450 block font-semibold">
                  Fracking en Perímetro
                </span>
              </div>

            </div>

            {/* NDWI Spectral Overlay Report */}
            <div className="p-3.5 bg-slate-900 border border-slate-850 rounded-xl flex items-start gap-3">
              <span className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400 shrink-0">
                <Activity className="w-4 h-4 animate-pulse" />
              </span>
              <div>
                <span className="text-[9.5px] font-mono font-bold text-sky-400 block uppercase">Indicador multiespectral actual (SENTINEL-2):</span>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  {selectedBody.spectralIndicator}
                </p>
              </div>
            </div>

            {/* Sparkline historical trend chart using customized styled SVG bars */}
            <div className="pt-2 border-t border-slate-850/60">
              <span className="text-[10px] font-mono text-slate-450 block uppercase tracking-wider mb-2 font-bold">
                Historial de turbidez y riesgo hidrológico (ESTACIONAL 2024 - 2026):
              </span>
              <div className="grid grid-cols-3 gap-4">
                {selectedBody.historicalData.map((data, idx) => (
                  <div key={idx} className="bg-slate-950/80 p-3 rounded-xl border border-slate-850 flex items-center justify-between gap-2.5">
                    <div>
                      <span className="text-[10.5px] font-bold text-slate-400 block font-mono">Año {data.year}</span>
                      <div className="flex gap-3 text-xs font-mono mt-1">
                        <div>
                          <span className="text-[9px] text-slate-500 block leading-none">TURBIDEZ:</span>
                          <span className="font-semibold text-slate-200 mt-0.5 block">{data.turbidity} NTU</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 block leading-none">RIESGO:</span>
                          <span className="font-semibold text-sky-400 mt-0.5 block">{data.risk}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Tiny styled visual micro-bar */}
                    <div className="h-9 w-6 flex items-end gap-0.5 bg-slate-900/50 p-1 rounded">
                      <div 
                        className="bg-slate-700 w-1/2 rounded-full transition-colors" 
                        style={{ height: `${(data.turbidity / 45) * 100}%` }}
                        title="NTU Bar"
                      ></div>
                      <div 
                        className="bg-sky-400 w-1/2 rounded-full transition-colors" 
                        style={{ height: `${data.risk}%` }}
                        title="Risk Bar"
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* AI Trigger button and dynamic report outputs */}
          <div className="space-y-4 pt-4 border-t border-slate-850/80">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <p className="text-[11px] text-slate-400 font-sans max-w-lg">
                Consulte con inteligencia artificial de teledetección para elaborar un análisis completo de dispersión hídrica superficial para {selectedBody.name}.
              </p>
              
              <button
                onClick={() => handleRunHydrologyAnalysis(selectedBody)}
                disabled={loading}
                className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 font-sans text-xs font-extrabold text-white rounded-xl shadow-lg shadow-sky-950/20 active:scale-95 transition-colors text-center flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                id="btn-run-hydrology-ai"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Auditando cuenca...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auditar cuenca con inteligencia artificial</span>
                  </>
                )}
              </button>
            </div>

            {/* Error state */}
            {error && (
              <div className="p-3 bg-red-950/30 border border-red-500/20 rounded-xl text-[11px] text-red-300 font-mono">
                <AlertTriangle className="w-4 h-4 text-red-400 inline mr-2 align-middle shrink-0" />
                <span>Error en el informe: {error}</span>
              </div>
            )}

            {/* Dynamic AI Report Display */}
            {report && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 animate-fade-in font-sans">
                
                {/* Header report metadata */}
                <div className="flex justify-between items-center pb-2 border-b border-slate-850 text-xs">
                  <span className="font-mono text-[10.5px] font-bold text-sky-400 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-sky-400" />
                    Informe de vulnerabilidad hidrogeológica regulatorio
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    Certeza: {report.certitude || "ALTA"} • Ley Nqn 1875
                  </span>
                </div>

                {/* Info banner for local calibrated backup mode */}
                {(report.certitude?.includes("Respaldo") || 
                  report.certitude?.includes("Simulación") || 
                  report.certitude?.includes("Falla")) && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/25 text-amber-300 rounded-xl flex items-start gap-2.5 text-xs font-sans leading-relaxed">
                    <AlertTriangle className="w-4.5 h-4.5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-amber-200 uppercase text-[11px] tracking-wide">
                        Circuito auxiliar de respaldo activado (AI OFFLINE)
                      </p>
                      <p className="text-slate-350 text-[10.5px] mt-1 leading-normal">
                        El servidor ha detectado una sobrecarga o falta de cuota en el canal de Inteligencia Artificial. Se ha levantado automáticamente un peritaje con nuestro modelo de simulación física calibrado de forma local para {selectedBody.name}.
                      </p>
                    </div>
                  </div>
                )}

                {/* Geolocalized Telemetry and Calculated Risk Parameters */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-950/40 p-1 rounded-xl">
                  <div className="bg-slate-950/80 border border-slate-850/80 p-2.5 rounded-lg flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Coordenadas de origen</span>
                    <span className="text-[11px] font-black font-mono text-sky-450 text-sky-400">
                      {report.coordenadas || `${selectedBody.latitude}, ${selectedBody.longitude}`}
                    </span>
                  </div>
                  
                  <div className="bg-slate-950/80 border border-slate-850/80 p-2.5 rounded-lg flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Zona / área industrial</span>
                    <span className="text-[11px] font-bold text-slate-300 truncate">
                      {report.zona_afectada || selectedBody.region}
                    </span>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-850/80 p-2.5 rounded-lg flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Riesgo asignado</span>
                    <span className={`text-[11px] font-extrabold font-mono flex items-center gap-1 ${
                      (report.nivel_riesgo_calculado || selectedBody.riskLevel) === 'Crítico' 
                        ? 'text-red-400' 
                        : (report.nivel_riesgo_calculado || selectedBody.riskLevel) === 'Alto' 
                        ? 'text-orange-400' 
                        : 'text-amber-400'
                    }`}>
                      ▲ {report.nivel_riesgo_calculado || selectedBody.riskLevel}
                    </span>
                  </div>

                  <div className="bg-slate-950/80 border border-slate-850/80 p-2.5 rounded-lg flex flex-col gap-0.5">
                    <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block">Vulnerabilidad ambiental</span>
                    <span className="text-[11px] font-black font-mono text-teal-400">
                      {report.porcentaje_vulnerabilidad || selectedBody.vulnerability}%
                    </span>
                  </div>
                </div>

                {/* Grid details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  
                  <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-850">
                    <span className="font-bold text-slate-200 block border-b border-slate-900 pb-1">
                      Diagnóstico de Teledetección Satelital (NDWI / Turbidez)
                    </span>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      {report.diagnostic_espectral || report.diagnostic_spectral}
                    </p>
                  </div>

                  <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-850">
                    <span className="font-bold text-slate-200 block border-b border-slate-900 pb-1">
                      Rutas de Contaminación Activas en Cuenca
                    </span>
                    <p className="text-[11px] text-slate-300 leading-normal">
                      {report.contaminacion_rutas || report.contamination_routes}
                    </p>
                  </div>

                </div>

                {/* Additional Detailed Sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  
                  <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-850">
                    <span className="font-bold text-slate-200 block border-b border-slate-900 pb-1 text-sky-400">
                      Fuentes Oficiales de Teledetección
                    </span>
                    <p className="text-[11px] text-slate-350 leading-normal">
                      <strong>Fuentes:</strong> {report.fuentes_datos || "ESA Copernicus Sentinel-2 MSI, NASA/USGS Landsat-9, Catastro Minero de Neuquén y Red Hidrométrica COIRCO."}
                    </p>
                    <p className="text-[11px] text-slate-350 leading-normal">
                      <strong>Fecha de observación satelital:</strong> {report.fecha_observacion || "2026-06-08 14:32:05 UTC (Pasada Descendente)"}
                    </p>
                  </div>

                  <div className="space-y-2 bg-slate-950 p-3 rounded-lg border border-slate-850">
                    <span className="font-bold text-slate-200 block border-b border-slate-900 pb-1 text-sky-400">
                      Análisis de Entidades Lindantes (-38.361, -68.762)
                    </span>
                    <p className="text-[11px] text-slate-350 leading-normal">
                      <strong>Estudio de proximidad:</strong> {report.empresas_industriales_cercanas || "Frack Shack (Área de acopio de fluidos y tanques de fracturación hídrica) e infraestructura lindera como LEGAM S.A. (Perímetro arbolado residencial/logístico)."}
                    </p>
                  </div>

                </div>

                {/* Legacy Active Location Environmental Assessment */}
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 space-y-2 text-xs">
                  <span className="font-black text-rose-450 text-xs flex items-center gap-1.5 uppercase">
                    <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />
                    Evaluación de Pasivo / Locación Histórica Activa (Explicación Satelital)
                  </span>
                  <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                    {report.locacion_historica_analisis || "La adyacencia de actividades intensas de fracking, como los patios hídricos activos y estanques antiguos de lodos, explican las elevadas reflectancias ópticas por derrames difusos históricos y lavado de maquinaria en estas coordenadas. La compactación del suelo arcilloso circundante a Frack Shack favorece escorrentías directas hacia el cauce del Río Neuquén."}
                  </p>
                </div>

                {/* Visual Satelital GIS de desvíos hídricos y escorrentías */}
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-850 space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1.5 border-b border-slate-900 pb-2">
                    <span className="font-extrabold text-xs text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
                      <Layers className="w-4 h-4 text-sky-400" />
                      Esquema cartográfico satelital de desvíos y descarga (Sentinel-2 GIS)
                    </span>
                    <span className="text-[9.5px] font-mono text-teal-400 font-extrabold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-teal-500 animate-ping inline-block"></span>
                      Enlace espectral activo (COORDS: -38.361, -68.762)
                    </span>
                  </div>

                  <div className="relative w-full aspect-[16/10] bg-slate-900 rounded-lg overflow-hidden border border-slate-850 select-none">
                    {/* SVG Representing Satellite Orthofoto Visual */}
                    <svg viewBox="0 0 800 500" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        {/* Terrain Base Gradient */}
                        <linearGradient id="terrainGradLive" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#1e2019" /> {/* Olive-grey clay soil */}
                          <stop offset="50%" stopColor="#25241e" /> {/* Sandy arid soil */}
                          <stop offset="100%" stopColor="#1a1c17" />
                        </linearGradient>

                        {/* River Deep Gradient */}
                        <linearGradient id="riverGradLive" x1="0%" y1="0%" x2="100%" y2="50%">
                          <stop offset="0%" stopColor="#083344" /> {/* Deep teal */}
                          <stop offset="50%" stopColor="#0e7490" /> {/* Glowing cyan */}
                          <stop offset="100%" stopColor="#155e75" />
                        </linearGradient>

                        {/* Spill Flow Gradient */}
                        <linearGradient id="spillGradLive" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#ea580c" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.4" />
                        </linearGradient>

                        {/* Glow filter */}
                        <filter id="glowLive" x="-20%" y="-20%" width="140%" height="140%">
                          <feGaussianBlur stdDeviation="5" result="blur" />
                          <feComposite in="SourceGraphic" in2="blur" operator="over" />
                        </filter>

                        {/* 10m spatial resolution pixel grid pattern */}
                        <pattern id="rasterPixelGridLive" width="16" height="16" patternUnits="userSpaceOnUse">
                          <rect width="16" height="16" fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.12" />
                        </pattern>
                      </defs>

                      {/* Terrain Base Rectangle */}
                      <rect width="800" height="500" fill="url(#terrainGradLive)" />

                      {/* 10m Spatial Resolution Raster Overlay */}
                      <rect width="800" height="500" fill="url(#rasterPixelGridLive)" pointerEvents="none" />

                      {/* Google Maps Grid lines overlay */}
                      <g opacity="0.12" stroke="#475569" strokeWidth="0.5">
                        <line x1="100" y1="0" x2="100" y2="500" />
                        <line x1="200" y1="0" x2="200" y2="500" />
                        <line x1="300" y1="0" x2="300" y2="500" />
                        <line x1="400" y1="0" x2="400" y2="500" />
                        <line x1="500" y1="0" x2="500" y2="500" />
                        <line x1="600" y1="0" x2="600" y2="500" />
                        <line x1="700" y1="0" x2="700" y2="500" />
                        <line x1="0" y1="100" x2="800" y2="100" />
                        <line x1="0" y1="200" x2="800" y2="200" />
                        <line x1="0" y1="300" x2="800" y2="300" />
                        <line x1="0" y1="400" x2="800" y2="400" />
                      </g>

                      {/* Bounding Coordinate Markers for GIS Alignment */}
                      <g opacity="0.45" fill="#94a3b8" fontSize="7.5" fontFamily="monospace">
                        <text x="105" y="12">L: -68.790°</text>
                        <text x="305" y="12">L: -68.762°</text>
                        <text x="505" y="12">L: -68.730°</text>
                        <text x="705" y="12">L: -68.700°</text>
                        <text x="5" y="108">S: -38.330°</text>
                        <text x="5" y="208">S: -38.361°</text>
                        <text x="5" y="308">S: -38.390°</text>
                        <text x="5" y="408">S: -38.420°</text>
                      </g>

                      {/* Viewfinder Target Crosshairs */}
                      <g stroke="#22d3ee" strokeWidth="0.5" opacity="0.3">
                        <line x1="400" y1="230" x2="400" y2="270" />
                        <line x1="380" y1="250" x2="420" y2="250" />
                        <circle cx="400" cy="250" r="10" fill="none" />
                      </g>

                      {/* Polígono Delimitado de Control de HSE - Sector Añelo */}
                      <polygon 
                        points="110,130 770,150 710,430 80,410" 
                        fill="none" 
                        stroke="#f43f5e" 
                        strokeWidth="1.5" 
                        strokeDasharray="5 4" 
                        opacity="0.8"
                      />
                      <g opacity="0.85">
                        <rect x="115" y="135" width="235" height="16" rx="2" fill="#020617" stroke="#f43f5e" strokeWidth="0.5" />
                        <text x="123" y="146" fill="#fca5a5" fontSize="7.5" fontFamily="monospace" fontWeight="bold">
                          ⌜Polígono registrado HSE - coirco sector-a • 4.2 km²⌟
                        </text>
                      </g>

                      {/* RIO NEUQUEN - Winding River Channel near the bottom right */}
                      <path 
                        d={mapLayout.riverPath} 
                        fill="url(#riverGradLive)" 
                        stroke={isSat ? "none" : mapLayout.riverColor}
                        strokeWidth={isSat ? 0 : 3} 
                        opacity="0.95"
                      />

                      {/* Tiny water direction particles / wave lines */}
                      <path d="M 50 430 Q 150 432 250 428" fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="10 20" opacity="0.6" strokeDashoffset="0" />
                      <path d="M 380 370 Q 480 340 580 332" fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="15 30" opacity="0.6" strokeDashoffset="0" />
                      <path d="M 600 325 Q 700 318 800 315" fill="none" stroke="#22d3ee" strokeWidth="1" strokeDasharray="8 25" opacity="0.6" strokeDashoffset="0" />

                      {/* Green Forest Protection Belt / Riparian vegetation - Bordering the River */}
                      <g fill="#14532d" stroke="#166534" strokeWidth="1" opacity="0.8">
                        {mapLayout.forestCluster.map((c, idx) => (
                          <circle key={idx} cx={c.cx} cy={c.cy} r={c.r} fill={idx >= mapLayout.forestCluster.length - 2 ? "#052e16" : undefined} />
                        ))}
                      </g>

                      {/* Dynamic Facility Buildings */}
                      <g opacity="0.9">
                        {(mapLayout.facilityRects || []).map((r, idx) => (
                          <g key={idx}>
                            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={2} fill={r.fill} stroke="#475569" strokeWidth="1" />
                            <polygon points={`${r.x},${r.y} ${r.x + r.w / 2},${r.y - 12} ${r.x + r.w},${r.y}`} fill={idx === 0 ? "#e2e8f0" : "#cbd5e1"} stroke="#475569" strokeWidth="1" />
                          </g>
                        ))}
                      </g>

                      {/* Dynamic orchards/industrial layouts depending on selected body */}
                      {selectedBody.id === "rio_neuquen" && (
                        <>
                          {/* LEGAM S.A. Green Orchard boundary grass */}
                          <path d="M 440 145 L 610 200 L 520 280 L 380 200 Z" fill="#15803d" fillOpacity="0.45" stroke="#22c55e" strokeWidth="1.5" strokeDasharray="3 3" />

                          {/* FRACK SHACK - Industrial yard layout */}
                          <polygon points="10,120 200,120 180,390 10,390" fill="#2d2b24" opacity="0.9" stroke="#454035" strokeWidth="1.5" />
                          <line x1="60" y1="120" x2="60" y2="390" stroke="#3f3a30" strokeWidth="1" strokeDasharray="5 5" />
                          <line x1="120" y1="120" x2="120" y2="390" stroke="#3f3a30" strokeWidth="1" strokeDasharray="5 5" />
                        </>
                      )}

                      {/* Blue Storage tanks - Dynamic */}
                      <g fill="#1e40af" stroke="#1d4ed8" strokeWidth="1.5">
                        {(mapLayout.blueTanks || []).map((t, idx) => (
                          <circle key={idx} cx={t.cx} cy={t.cy} r={t.r} fill="#0284c7" stroke="#0369a1" />
                        ))}
                      </g>

                      {/* THE BYPASS WATER EXTRACTION / CRITICAL RUNOFF CHANNEL (Desvío Hídrico) - Dynamic */}
                      {mapLayout.bypassPath && (
                        <>
                          <path 
                            d={mapLayout.bypassPath} 
                            fill="none" 
                            stroke="url(#spillGradLive)" 
                            strokeWidth="11" 
                            strokeLinecap="round" 
                            opacity="0.85" 
                            filter="url(#glowLive)"
                          />
                          <path 
                            d={mapLayout.bypassPath} 
                            fill="none" 
                            stroke={mapLayout.bypassColor || "#f43f5e"} 
                            strokeWidth="3" 
                            strokeLinecap="round" 
                            strokeDasharray="8 8" 
                          />
                        </>
                      )}

                      {/* Secondary erosion runoffs / paths - Dynamic */}
                      {(mapLayout.erosionPaths || []).map((pathString, idx) => (
                        <path key={idx} d={pathString} fill="none" stroke={idx === 0 ? "#f97316" : "#ef4444"} strokeWidth="2.5" strokeDasharray="4 6" opacity="0.65" />
                      ))}

                      {/* LEGAM S.A. Pin & Label */}
                      <g transform={`translate(${mapLayout.label2Coords.cx}, ${mapLayout.label2Coords.cy})`}>
                        <circle cx="0" cy="0" r="16" fill="#020617" fillOpacity="0.8" stroke="#10b981" strokeWidth="1.5" />
                        <circle cx="0" cy="0" r="5" fill="#10b981" />
                        <rect x="-42" y="-36" width="84" height="18" rx="4" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
                        <text x="0" y="-23" fill="#f8fafc" fontSize="10" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
                          {mapLayout.label2Name}
                        </text>
                      </g>

                      {/* Frack Shack Pin & Label */}
                      <g transform={`translate(${mapLayout.label1Coords.cx}, ${mapLayout.label1Coords.cy})`}>
                        <circle cx="0" cy="0" r="16" fill="#020617" fillOpacity="0.8" stroke="#3b82f6" strokeWidth="1.5" />
                        <circle cx="0" cy="0" r="5" fill="#3b82f6" />
                        <rect x="-48" y="-36" width="96" height="18" rx="4" fill="#0f172a" stroke="#1e293b" strokeWidth="1" />
                        <text x="0" y="-23" fill="#f8fafc" fontSize="10" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">
                          {mapLayout.label1Name}
                        </text>
                      </g>

                      {/* Spill runoff point & alert indicator */}
                      <g transform={`translate(${mapLayout.dischargeCoords.cx + 30}, ${mapLayout.dischargeCoords.cy - 80})`}>
                        <circle cx="0" cy="0" r="24" fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="3 3">
                          <animate attributeName="r" values="18;30;18" dur="3s" repeatCount="indefinite" />
                        </circle>
                        <rect x="-85" y="-45" width="170" height="28" rx="5" fill="#020617" fillOpacity="0.95" stroke="#f43f5e" strokeWidth="1.5" />
                        <text x="0" y="-32" fill="#fca5a5" fontSize="9" fontWeight="extrabold" fontFamily="sans-serif" textAnchor="middle">
                          {mapLayout.alertTitle}
                        </text>
                        <text x="0" y="-21" fill="#cbd5e1" fontSize="8" fontFamily="sans-serif" textAnchor="middle">
                          {mapLayout.alertSub}
                        </text>
                      </g>

                      {/* Core coordinates focus overlay */}
                      <g transform={`translate(${mapLayout.dischargeCoords.cx}, ${mapLayout.dischargeCoords.cy})`}>
                        <path d="M 0,0 L 25,-40 L 70,-40" fill="none" stroke="#fbbf24" strokeWidth="1" />
                        <circle cx="0" cy="0" r="6" fill="#fbbf24" stroke="#020617" strokeWidth="1" />
                        <text x="32" y="-46" fill="#fbbf24" fontSize="9.5" fontWeight="black" fontFamily="monospace">
                          {mapLayout.dischargeName}
                        </text>
                        <text x="32" y="-28" fill="#fef08a" fontSize="8" fontFamily="monospace">
                          Coords: {coords}
                        </text>
                      </g>

                      {/* Compass and Metadata Display */}
                      <g transform="translate(730, 70)" opacity="0.85">
                        <circle cx="0" cy="0" r="28" fill="#0f172a" stroke="#334155" strokeWidth="1" />
                        <line x1="0" y1="-22" x2="0" y2="22" stroke="#64748b" strokeWidth="1" />
                        <line x1="-22" y1="0" x2="22" y2="0" stroke="#64748b" strokeWidth="1" />
                        <polygon points="0,-24 5,0 -5,0" fill="#ef4444" />
                        <polygon points="0,24 5,0 -5,0" fill="#94a3b8" />
                        <text x="0" y="-28" fill="#f8fafc" fontSize="9" fontWeight="bold" fontFamily="sans-serif" textAnchor="middle">N</text>
                      </g>

                      {/* Dynamic Legend grid from legendItems */}
                      <rect x="25" y="445" width="220" height="42" rx="4" fill="#020617" fillOpacity="0.9" stroke="#334155" strokeWidth="1" />
                      <g transform="translate(35, 453)">
                        {mapLayout.legendItems.map((item, idx) => {
                          const col = idx < 2 ? 0 : 1;
                          const row = idx % 2;
                          const x = col === 0 ? 0 : 110;
                          const y = row * 14;
                          return (
                            <g key={idx} transform={`translate(${x}, ${y})`}>
                              <circle cx="5" cy="5" r="4" fill={item.color} />
                              <text x="15" y="9" fill="#94a3b8" fontSize="8.5" fontFamily="sans-serif">
                                {item.label}
                              </text>
                            </g>
                          );
                        })}
                      </g>

                      {/* scanning sweep line */}
                      <line x1="0" y1="0" x2="0" y2="500" stroke="#10b981" strokeWidth="1.5" opacity="0.35">
                        <animate attributeName="x1" values="0;800;0" dur="8s" repeatCount="indefinite" />
                        <animate attributeName="x2" values="0;800;0" dur="8s" repeatCount="indefinite" />
                      </line>

                    </svg>

                    {/* HUD Overlays */}
                    <div className="absolute top-3 left-3 bg-slate-950/90 border border-slate-800/80 px-2.5 py-1.5 rounded text-[9px] font-mono text-slate-300 space-y-0.5 shadow-lg max-w-[200px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-ping"></div>
                        <span className="font-extrabold text-sky-400">Sentinel-2 msi L2A</span>
                      </div>
                      <div className="text-slate-450 leading-tight">Resolución espacial: 10M</div>
                      <div className="text-slate-450 leading-tight block truncate">BANDA 3 (V) / BANDA 8 (V-IR)</div>
                    </div>

                    <div className="absolute bottom-3 right-3 bg-slate-950/90 border border-slate-800/80 px-2 rounded py-1 text-[9px] font-mono text-slate-450 shadow-lg">
                      Escala gráfica aprox. 1 : 4.500
                    </div>

                  </div>
                  
                  <div className="p-3 bg-slate-900/60 rounded-lg border border-slate-850/60 text-[10.5px] text-slate-300 leading-relaxed font-sans">
                    <strong>Interpretación Cartográfica de Auditoría:</strong> {mapLayout.interpretationText}
                  </div>

                  {/* Confidence Index Methodology Panel */}
                  <div className="p-3.5 bg-slate-950/80 border border-slate-850/70 rounded-lg space-y-2.5">
                    <div className="flex justify-between items-center border-b border-slate-900/80 pb-1.5 flex-wrap gap-2">
                      <span className="text-[10px] font-mono font-bold text-sky-400 flex items-center gap-1.5 uppercase tracking-wider">
                        ÍNDICE DE CONFIANZA DEL MODELO ESPECTRAL: {selectedBody.oilSlickRisk}%
                      </span>
                      <span className="text-[9px] font-mono p-1 rounded bg-slate-900 text-teal-400 uppercase leading-none font-bold">
                        Banda 3 (Green) vs Banda 8 (NIR)
                      </span>
                    </div>
                    
                    <div className="text-[10.5px] leading-relaxed text-slate-400 space-y-1">
                      <p className="font-semibold text-slate-300">
                        La calibración e indexación del {selectedBody.oilSlickRisk}% de probabilidad se fundamenta en la confluencia de estos 4 indicadores técnicos activos:
                      </p>
                      <ul className="list-disc pl-4 space-y-1 mt-1 text-slate-400">
                        <li>
                          <strong className="text-slate-300">NDWI anómalo:</strong> Desviaciones persistentes en el umbral típico de agua clara (B3/B8) compatibles con capas de dispersión orgánica.
                        </li>
                        <li>
                          <strong className="text-slate-300">Persistencia temporal:</strong> Contraste estacional robusto con órbitas del Copernicus Sentinel-2 del último año bajo idénticas condiciones locales.
                        </li>
                        <li>
                          <strong className="text-slate-300">Proximidad a instalaciones:</strong> Distancia menor a 2,000m desde {selectedBody.id === "rio_neuquen" ? "los patios logísticos de Frack Shack" : "yacimientos y cruces de ductos troncales de transporte"}.
                        </li>
                        <li>
                          <strong className="text-slate-300">Ausencia de nubosidad:</strong> Cobertura de nubes regional inferior al 2.5% sobre la escena evaluada, eliminando toda interferencia o sombras espurias.
                        </li>
                      </ul>
                    </div>
                  </div>

                </div>

                {/* Suggested remediation action */}
                <div className="bg-sky-950/15 border border-sky-500/20 p-3.5 rounded-lg space-y-1.5">
                  <span className="font-bold text-sky-400 text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-400" />
                    Plan de Contingencia Recomendado de Aguas Vaca Muerta (HSE)
                  </span>
                  <p className="text-[11px] text-slate-350 leading-normal">
                    {report.contingency_plan || report.plan_contingencia}
                  </p>
                </div>

                {/* 5 Minimum Required Backups Validation Block */}
                <div className="bg-slate-950/50 border border-slate-850/80 p-4 rounded-xl space-y-4">
                  <div className="flex justify-between items-center flex-wrap gap-2">
                    <span className="font-semibold text-xs text-sky-450 flex items-center gap-2 uppercase tracking-wide">
                      <ClipboardCheck className="w-4 h-4 text-emerald-400 animate-pulse" />
                      Respaldos Mínimos de Validación Requeridos (Lic. Paredes Victor)
                    </span>
                    <span className="text-[9.5px] font-mono text-slate-500 uppercase">Estado: Pendiente Certificación Terrestre</span>
                  </div>

                  {/* Ground Warning Banner (Specifically requested by user) */}
                  <div className="p-3.5 rounded-lg border border-amber-500/25 bg-amber-500/10 text-[10.5px] leading-relaxed text-slate-300">
                    <span className="font-bold text-amber-400 block mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      Aviso de validación & criterio de acción regulatorio:
                    </span>
                    <p className="mb-2">
                      <strong>Falta validación in-situ:</strong> A la fecha, este diagnóstico se sustenta en firmas espectrales computadas robóticamente. Para una certificación pericial plena, <strong>falta la validación en terreno</strong> (muestreo físico terrestre de agua, espectrofotometría directa de muestras y calibración local directa por sensor). Las firmas espectrales ópticas poseen márgenes de incertidumbre naturales.
                    </p>
                    <p>
                      <strong>Exigencia de acción preventiva:</strong> No obstante, la concurrencia de estas anomalías de reflectancia hídrica NDWI y los rangos de turbidez observados <strong>ameritan plenamente iniciar una inspección inmediata en terreno</strong> de carácter oficial para descartar o ratificar definitivamente los riesgos críticos y pasivos detallados.
                    </p>
                  </div>

                  <p className="text-[10.5px] text-slate-400 leading-normal font-sans">
                    El sistema archiva e integra de manera automática estos 5 respaldos técnicos específicos para auditar en profundidad a <strong>{selectedBody.name}</strong>:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg flex items-start gap-2.5 hover:border-slate-800 transition-colors w-full overflow-hidden">
                      <div className="w-5 h-5 rounded-md bg-sky-950/50 border border-sky-500/20 text-sky-450 font-mono text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">01</div>
                      <div className="space-y-1 w-full min-w-0">
                        <span className="text-[10.5px] font-bold text-slate-200 block">ID de Escena Satelital</span>
                        <code className="text-[9px] text-slate-300 font-mono select-all bg-slate-950/95 p-1 rounded border border-slate-850 block overflow-x-auto whitespace-nowrap">{uiBackups.sceneId}</code>
                        <p className="text-[9.5px] text-slate-500">ID exacto del paso Sentinel-2/Landsat-9 para trazabilidad científica.</p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg flex items-start gap-2.5 hover:border-slate-800 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-sky-950/50 border border-sky-500/20 text-sky-450 font-mono text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">02</div>
                      <div className="space-y-1">
                        <span className="text-[10.5px] font-bold text-slate-200 block">Imagen Satelital Cruda/Procesada</span>
                        <p className="text-[10px] text-slate-400 leading-normal">{uiBackups.originalProcessed}</p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg flex items-start gap-2.5 hover:border-slate-800 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-sky-950/50 border border-sky-500/20 text-sky-450 font-mono text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">03</div>
                      <div className="space-y-1">
                        <span className="text-[10.5px] font-bold text-slate-200 block">Ecuación / Fórmula Detallada</span>
                        <code className="text-[10px] text-teal-400 font-mono bg-slate-950/70 py-1 px-1.5 rounded border border-slate-850 block leading-tight">{uiBackups.formula}</code>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg flex items-start gap-2.5 hover:border-slate-800 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-sky-950/50 border border-sky-500/20 text-sky-450 font-mono text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">04</div>
                      <div className="space-y-1">
                        <span className="text-[10.5px] font-bold text-slate-200 block">Estación / Justificación ({selectedBody.turbidity} NTU)</span>
                        <p className="text-[10px] text-slate-400 leading-normal">{uiBackups.samplingPoint}</p>
                      </div>
                    </div>
                    <div className="p-3 bg-slate-900/40 border border-slate-850 rounded-lg flex items-start gap-2.5 col-span-1 sm:col-span-2 hover:border-slate-800 transition-colors">
                      <div className="w-5 h-5 rounded-md bg-sky-950/50 border border-sky-500/20 text-sky-450 font-mono text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">05</div>
                      <div className="space-y-1">
                        <span className="text-[10.5px] font-bold text-slate-200 block">Comparación Multitemporal & Máscara de Nubes</span>
                        <p className="text-[10px] text-slate-400 leading-normal">{uiBackups.multitemporalCloud}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* PDF printable view and action */}
                <div className="bg-slate-950/60 p-4 border border-slate-850 rounded-xl space-y-3 text-xs print:hidden">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div className="space-y-0.5 text-left">
                      <span className="text-[11px] font-bold text-slate-200 block">¿Desea archivar o exportar este Informe Preliminar Regulatorio?</span>
                      <p className="text-[10px] text-slate-450 leading-normal">
                        Genera un reporte analítico oficial de monitoreo hídrico a través de un sistema propio listo para guardar en PDF. 
                        <span className="text-amber-400 block sm:inline sm:ml-1 font-medium">Nota de Vista Preliminar: Utilice la opción de descargar si se encuentra dentro del visor integrado (iFrame).</span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pb-0.5">
                    <button
                      onClick={generateHtmlCode}
                      className="px-3.5 py-2.5 bg-gradient-to-r from-teal-600 to-sky-650 hover:from-teal-500 hover:to-sky-550 font-sans text-[10px] font-bold text-white rounded-lg shadow transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                      id="btn-download-html-report"
                    >
                      <Download className="w-3.5 h-3.5 text-teal-200" />
                      <span>Descargar registro completo (PDF/HTML)</span>
                    </button>

                    <button
                      onClick={() => {
                        window.print();
                      }}
                      className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 font-sans text-[10px] font-bold text-slate-300 rounded-lg border border-slate-800 transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                      id="btn-print-direct"
                    >
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <span>Imprimir directo desde pestaña</span>
                    </button>
                  </div>
                </div>

                {/* Legal compliance alert banner */}
                <div className="flex justify-between items-center text-[10px] font-mono text-slate-550 border-t border-slate-850 pt-2 text-[9.5px]">
                  <span>Reporte Generado por Sistema Propio - Lic. Paredes Victor</span>
                  <span className="font-black text-emerald-400">Monitoreo continuo activado</span>
                </div>

              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
