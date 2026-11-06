# Plan de Implementación: Integración Geoportal SIG Hidrocarburífero y Detección Satelital en Vivo

Este plan describe la arquitectura y pasos para sustituir por completo cualquier coordenada manual del sistema por un flujo 100% basado en datos reales:
1. **Infraestructura y Catastro Oficial:** Geoportal SIG Hidrocarburífero de la Secretaría de Energía (SEN) y Provincia del Neuquén (IDENEU / Catastro Oficial).
2. **Detecciones en Tiempo Real:** Detección térmica satelital de NASA FIRMS (VIIRS) y Copernicus Sentinel-2 (ESA) con coordenadas exactas emitidas por los sensores espaciales.
3. **Motor de Cruce Espacial (Spatial Join):** Correlación automática entre el foco térmico detectado por el satélite y la planta/batería más cercana catalogada por el Geoportal oficial.

---

## 1. Fase 1: Catastro Oficial del Geoportal SIG Hidrocarburífero (Backend)

* **Objetivo:** Disponer de la cartografía vectorial oficial de todas las instalaciones aprobadas en la Cuenca Neuquina (Añelo, Rincón de los Sauces, Fortín de Piedra, El Orejano, Loma Campana, La Calera, Aguada Pichana, Bajo del Choique, Sierras Blancas, etc.).
* **Acciones:**
  * Crear el servicio backend `geoportalSigService.ts` conectado a los catálogos y geoservicios oficiales (formato GeoJSON/WFS normalizado de la Secretaría de Energía de la Nación y Geoportal Neuquén).
  * Estructurar el catálogo con atributos oficiales:
    * `codigo_sig`: Identificador catastral único de la instalación.
    * `nombre_oficial`: Denominación legal registrada (CPF, Batería, Planta Compresora, Cargadero).
    * `operador_oficial`: Empresa concesionaria responsable (YPF, Tecpetrol, TotalEnergies, Dow, Pluspetrol, Shell, TGS, Pan American Energy).
    * `bloque_concesion`: Área hidrocaburífera asignada por decreto.
    * `coordenadas_oficiales`: Coordenadas WGS84 de mensura de campo.
    * `radio_tolerancia_metros`: Umbral métrico oficial para validación de instalaciones.
  * Endpoint backend: `GET /api/geoportal/instalaciones` con soporte para filtrado por operador o cuadrante de la cuenca.

---

## 2. Fase 2: Ingesta de Detecciones Satelitales en Vivo (NASA FIRMS VIIRS + Sentinel-2 ESA)

* **Objetivo:** Obtener las coordenadas geográficas reales emitidas por los satélites para cada evento térmico o pluma de gas activa.
* **Acciones:**
  * Desarrollar el adaptador de ingesta satelital en `server.ts` con soporte para:
    * **NASA FIRMS (Fire Information for Resource Management System):** Consulta satelital de VIIRS (satélites Suomi-NPP y NOAA-20/21) en el cuadrante de Vaca Muerta `[-69.7° a -68.2° W, -38.7° a -37.7° S]`.
      * Parámetros satelitales recibidos: `latitude`, `longitude`, `frp` (Potencia Radiativa de Fuego en MW), `brightness_temp_k` (Temperatura en Kelvin), `acq_datetime` (Fecha y hora exacta de captura), `confidence` y sensor detector (`VIIRS_I_Band_375M`).
    * **Copernicus Sentinel-2 MSI (L2A):** Detección espectral de alta resolución óptica (20m) mediante reflectancia infrarroja SWIR (bandas B11/B12) que detectan antorchas activas y venteos calientes.
  * Endpoint backend: `GET /api/satellites/detecciones-en-vivo`.

---

## 3. Fase 3: Motor de Cruce Espacial Automático (Spatial Join Engine)

* **Objetivo:** Vincular matemáticamente cada coordenada satelital con la planta catastral correspondiente sin intervención humana ni suposiciones.
* **Acciones:**
  * Implementar el algoritmo de correlación espacial ortodrómica:
    $$\text{distancia} = \text{Haversine}(\text{lat}_{\text{satélite}}, \text{lon}_{\text{satélite}}, \text{lat}_{\text{oficial}}, \text{lon}_{\text{oficial}})$$
  * **Lógica de clasificación automática:**
    1. **Asociación Directa:** Si la coordenada emitida por el satélite cae dentro del radio de tolerancia de una instalación del Geoportal SIG (ej. $< 500\text{ m}$), la alerta se asocia a esa instalación oficial con su nombre legal, concesión y operador.
    2. **Detección con Desvío:** Si la distancia supera la tolerancia pero está dentro del perímetro del bloque petrolero, se etiqueta como: *"Foco térmico en bloque [Nombre] a X metros de la planta [Nombre]. Posible cargadero o fosa secundaria"*.
    3. **Anomalía Aislada:** Si no hay ninguna instalación oficial en un radio amplio, se presenta como: *"Detección satelital independiente sin infraestructura oficial catastrada"*.
  * Endpoint backend: `GET /api/venteos/monitoreo-satelital-en-vivo` que entrega el conjunto de datos unificado y clasificado.

---

## 4. Fase 4: Actualización del Módulo de Venteos y Visualización en Mapa (Frontend)

* **Objetivo:** Erradicar por completo cualquier dato manual del cliente y reflejar en tiempo real la fusión entre el Geoportal SIG y las pasadas satelitales.
* **Acciones:**
  * Modificar `src/components/VenteosMonitorModule.tsx`:
    * Reemplazar la dependencia estática de `venteoPresets.ts` por una llamada reactiva al endpoint de cruce espacial en vivo `/api/venteos/monitoreo-satelital-en-vivo`.
    * En el mapa satelital (Leaflet sobre Google Satellite HD):
      * Capa vectorial oficial del Geoportal SIG (polígonos de concesión y marcadores de instalaciones fijas con su icono de infraestructura).
      * Capa de anomalías satelitales en vivo (con el icono del satélite emisor: VIIRS o Sentinel-2, potencia térmica en MW y vector de enlace espacial si está asignada a una planta).
    * Panel de telemetría y auditoría:
      * Muestra el sello de auditoría: *"Coordenadas transmitidas por satélite: [lat, lon] · Cruzadas con Catastro Oficial SEN: [lat, lon] · Distancia: X m"*.
      * Ficha de detalle con el sensor espacial emisor, fecha/hora de pasada y potencia radiativa en MW.
      * Auditoría regulatoria con IA (Gemini 3.8 Flash) evaluando la infracción sobre los datos reales del satélite.
  * Eliminar coordenadas obsoletas y maquetas manuales en desuso.

---

## 5. Criterios de Aceptación y Verificación

1. **Cero Coordenadas Manuales:** Ninguna planta o antorcha del módulo dependerá de listas hardcodeadas fijas; todas se obtienen por el Geoportal SIG y los sensores satelitales.
2. **Precisión Geográfica Absoluta:** 
   * Loma Campana CPF se mantendrá en su predio oficial de mensura.
   * El Orejano aparecerá en su ubicación real en el corredor norte hacia Rincón de los Sauces junto al Arroyo Carranza, jamás en la Ruta 17 ni en Cruz de Lorena.
3. **Trazabilidad Satelital:** Cada marcador indicará el satélite de origen (VIIRS / Sentinel-2), la fecha/hora UTC exacta de detección y el estado de correlación catastral.
4. **Validación Técnica:** `compile_applet` y `lint_applet` sin errores (0 warnings, 0 fallos de compilación).
