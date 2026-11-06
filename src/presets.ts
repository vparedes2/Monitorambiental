import { Hotspot } from "./types";

// Embedded beautiful mock satellite visualizations (SVG data URLs representing multispectral views)
export const SATELLITE_IMAGES = {
  oil_spill: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="100%" height="100%" fill="%231e293b"/>
    <grid opacity="0.1" stroke="%23ffffff" stroke-width="1">
      <path d="M 0 50 L 400 50 M 0 100 L 400 100 M 0 150 L 400 150 M 0 200 L 400 200 M 0 250 L 400 250" />
      <path d="M 50 0 L 50 300 M 100 0 L 100 300 M 150 0 L 150 300 M 200 0 L 200 300 M 250 0 L 250 300 M 300 0 L 300 300 M 350 0 L 350 300" />
    </grid>
    <path d="M 120,150 Q 180,90 260,140 T 350,180 Q 240,240 160,200 Z" fill="%23090d16" stroke="%2300f2fe" stroke-width="3" opacity="0.85"/>
    <circle cx="160" cy="150" r="10" fill="%23ff0055" opacity="0.8"/>
    <path d="M 160,150 L 320,180" stroke="%233b82f6" stroke-dasharray="5 5" stroke-width="2"/>
    <text x="20" y="40" fill="%2300f2fe" font-family="monospace" font-size="12">BAND-4 (NIR) SPILL PLUME</text>
    <text x="20" y="270" fill="%2394a3b8" font-family="monospace" font-size="10">COORDS: -38.398, -68.582 | SATELLITE REF: VM-SENTINEL-2B</text>
  </svg>`,
  
  gas_leak: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="100%" height="100%" fill="%231e293b"/>
    <ellipse cx="200" cy="150" rx="110" ry="60" fill="url(%23g1)" opacity="0.8"/>
    <defs>
      <radialGradient id="g1" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="%23a855f7" stop-opacity="1"/>
        <stop offset="60%" stop-color="%23ec4899" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="%231e293b" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="200" cy="150" r="8" fill="%2300ffff"/>
    <path d="M 200,150 Q 240,110 320,105" stroke="%23a855f7" stroke-width="2" stroke-dasharray="4 4" opacity="0.6"/>
    <text x="20" y="40" fill="%23a855f7" font-family="monospace" font-size="12">BAND-12 (SWIR) METANO OVERLAY (CAMS)</text>
    <text x="20" y="270" fill="%2394a3b8" font-family="monospace" font-size="10">COORDS: -37.812, -69.052 | INTENS_MAX: 12.4 ppm</text>
  </svg>`,

  thermal_flaring: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="100%" height="100%" fill="%231a0b0b"/>
    <circle cx="200" cy="150" r="60" fill="url(%23g2)" opacity="0.9"/>
    <defs>
      <radialGradient id="g2" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="%23ffeb3b" stop-opacity="1"/>
        <stop offset="30%" stop-color="%23f44336" stop-opacity="0.8"/>
        <stop offset="70%" stop-color="%239c27b0" stop-opacity="0.4"/>
        <stop offset="100%" stop-color="%231a0b0b" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="200" cy="150" r="12" fill="%23ffffff"/>
    <circle cx="200" cy="150" r="4" fill="%23ff0000"/>
    <text x="20" y="40" fill="%23f44336" font-family="monospace" font-size="12">BAND-11 (TIR) THERMAL FLARING SCATTER</text>
    <text x="20" y="270" fill="%23ef4444" font-family="monospace" font-size="10">TEMP_CORE: 840°C | COORDS: -38.221, -68.995</text>
  </svg>`,

  sludge_pit: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="100%" height="100%" fill="%231e293b"/>
    <polygon points="120,100 280,110 310,210 140,225" fill="%23451e05" stroke="%2310b981" stroke-width="2" opacity="0.8"/>
    <path d="M 130,120 Q 210,130 260,115" stroke="%23ec4899" stroke-width="2" opacity="0.5"/>
    <circle cx="212" cy="162" r="5" fill="%23ffffff" opacity="0.9"/>
    <text x="20" y="40" fill="%2310b981" font-family="monospace" font-size="12">INTEGRAL MULTISPECTRAL: RECTANGULAR PIT LEAKAGE</text>
    <text x="20" y="270" fill="%2394a3b8" font-family="monospace" font-size="10">COORDS: -38.252, -68.643 | RESERVA DE LODOS ACUMULADA</text>
  </svg>`,

  generic_soil: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="100%" height="100%" fill="%231e293b"/>
    <path d="M 100,80 Q 200,60 300,120 T 350,220 Q 250,260 150,200 Z" fill="%234d382b" stroke="%23f97316" stroke-width="2" opacity="0.8"/>
    <circle cx="225" cy="150" r="10" fill="%23f97316" opacity="0.6"/>
    <text x="20" y="40" fill="%23f97316" font-family="monospace" font-size="12">SOIL SATURATION OVERLAY</text>
    <text x="20" y="270" fill="%2394a3b8" font-family="monospace" font-size="10">COORDS: -38.112, -68.721 | RECON_VEG_INDEX: -0.42</text>
  </svg>`,

  river_ndwi: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
    <rect width="100%" height="100%" fill="%230f172a"/>
    <path d="M 0,220 Q 150,150 250,120 T 400,90" fill="none" stroke="%2338bdf8" stroke-width="12" opacity="0.6"/>
    <path d="M 120,180 Q 180,160 210,140 T 300,110" fill="none" stroke="%23a855f7" stroke-width="8" stroke-dasharray="2 2" opacity="0.9"/>
    <circle cx="180" cy="165" r="8" fill="%23ff0055" opacity="0.8"/>
    <text x="20" y="40" fill="%2338bdf8" font-family="monospace" font-size="12">BAND B3-B8 NDWI WATER METRICS</text>
    <text x="20" y="270" fill="%2394a3b8" font-family="monospace" font-size="10">COORDS: -38.361, -68.762 | FLUID DISCHARGE SLICK DETECTED</text>
  </svg>`
};

export const PRESET_HOTSPOTS: Hotspot[] = [
  {
    id: "loma_campana",
    name: "Loma Campana - Pileta de Hidrocarburos Irregular",
    locationName: "Yacimiento Loma Campana (YPF)",
    latitude: -38.252,
    longitude: -68.643,
    type: "Acumulación de lodos",
    windSpeed: 45,
    windDirection: "SW",
    ch4Value: 3.2,
    co2Value: 460,
    no2Value: 28,
    so2Value: 12,
    surfaceArea: 3200,
    status: "Crítico",
    description: "Saturación irregular de lodos de perforación y residuos oleosos en pileta de contención degradada. Ubicado a metros de RP 7 y canales de escorrentía naturales. El viento sudoeste de 45 km/h desplaza una pluma gaseosa y de polvo contaminante en sentido directo hacia Añelo.",
    imageUrl: SATELLITE_IMAGES.sludge_pit
  },
  {
    id: "bandurria_sur",
    name: "Bandurria Sur - Derrame Superficial de Agua de Retorno",
    locationName: "Yacimiento Bandurria Sur",
    latitude: -38.398,
    longitude: -68.582,
    type: "Derrame en suelo",
    windSpeed: 38,
    windDirection: "W",
    ch4Value: 2.1,
    co2Value: 425,
    no2Value: 18,
    so2Value: 35,
    surfaceArea: 8400,
    status: "Crítico",
    description: "Derrame masivo de agua de retorno (flowback). Líquido altamente salino cargado de metales pesados y aditivos de fractura, desplazándose por un paleocauce natural con dirección directa al Río Neuquén (margen norte, zona productiva flanqueante).",
    imageUrl: SATELLITE_IMAGES.oil_spill
  },
  {
    id: "rio_neuquen_derrame",
    name: "Río Neuquén - Infiltración Industrial en Cuenca de Margen",
    locationName: "Cuenca Fluvial del Río Neuquén (Añelo)",
    latitude: -38.361,
    longitude: -68.762,
    type: "Derrame en agua",
    windSpeed: 42,
    windDirection: "SW",
    ch4Value: 2.3,
    co2Value: 440,
    no2Value: 24,
    so2Value: 30,
    surfaceArea: 5400,
    status: "Crítico",
    description: "Infiltración física y escurrimiento de efluentes industriales no tratados directamente sobre la margen del Río Neuquén. El modelo de teledetección NDWI (Normalized Difference Water Index) confirma un cambio severo de reflectancia compatible con presencia de hidrocarburos / película oleosa (slick) flotante.",
    imageUrl: SATELLITE_IMAGES.river_ndwi
  },
  {
    id: "aguada_pichana",
    name: "Aguada Pichana - Incidente de Combustión de Antorcha",
    locationName: "Aguada Pichana Oeste (Total)",
    latitude: -38.221,
    longitude: -68.995,
    type: "Anomalía Térmica",
    windSpeed: 52,
    windDirection: "Oeste",
    ch4Value: 1.8,
    co2Value: 580,
    no2Value: 72,
    so2Value: 48,
    surfaceArea: 1500,
    status: "Alto",
    description: "Combustión deficiente y descontrolada (flaring) que genera una inmensa columna de humo negro (carbono negro y compuestos orgánicos volátiles). La temperatura central registrada por banda infrarroja térmica supera los 800°C en condiciones de tormenta de viento.",
    imageUrl: SATELLITE_IMAGES.thermal_flaring
  },
  {
    id: "bajo_del_choique",
    name: "Bajo del Choique - Venteo Atmosférico de Metano",
    locationName: "Bajo del Choique (ExxonMobil)",
    latitude: -37.812,
    longitude: -69.052,
    type: "Venteo Atmosférico",
    windSpeed: 28,
    windDirection: "Sudoeste",
    ch4Value: 12.4,
    co2Value: 412,
    no2Value: 12,
    so2Value: 8,
    surfaceArea: 400,
    status: "Alto",
    description: "Venteo continuo silencioso detectado por teledetección infrarroja de onda corta (SWIR). El sensor CAMS registra un anomalía severa de metano localizada que llega a 12.4 ppm en la vertical de la cabeza del pozo y la estación separadora.",
    imageUrl: SATELLITE_IMAGES.gas_leak
  },
  {
    id: "el_orejano",
    name: "El Orejano - Filtración y Acumulación de Tierras Contaminadas",
    locationName: "Yacimiento El Orejano",
    latitude: -37.9650,
    longitude: -69.1920,
    type: "Derrame en suelo",
    windSpeed: 30,
    windDirection: "SW",
    ch4Value: 2.8,
    co2Value: 435,
    no2Value: 20,
    so2Value: 15,
    surfaceArea: 4800,
    status: "Medio",
    description: "Crecimiento progresivo de acumulación de tierras saturadas en base oleosa y lodos industriales de descarte. La teledetección NDVI / NDVI modificado muestra una severa degradación vegetal periférica con avance descontrolado.",
    imageUrl: SATELLITE_IMAGES.generic_soil
  }
];
