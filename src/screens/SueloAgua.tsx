import React, { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MLMap } from "maplibre-gl";
import Globo, { setGeo } from "../components/Globo";
import { circuloKm } from "../lib/orbits";
import { Loader2, Crosshair, ListChecks, FileDown } from "lucide-react";
import { capturarMapa, generarInformePDF, nombreArchivo, type ItemLeyenda } from "../lib/exportar";
import { useSesion } from "../lib/sesion";
import { useInyeccion, leerIny, COHERENCIA } from "../lib/inyeccion";
import { obtenerBarrido, barridoFijo, conCache } from "../services/osmGeo";
import { useSigNeuquen } from "../lib/neuquen";

type Nivel = "normal" | "observar" | "alerta" | "sin_datos";

interface Indicador {
  id: string;
  nombre: string;
  base: number | null;
  reciente: number | null;
  delta: number | null;
  unidad?: string;
  nivel: Nivel;
  lectura: string;
}

interface Resultado {
  punto: { lat: number; lon: number };
  radio_m: number;
  periodos: { reciente: { desde: string; hasta: string; escenas_validas: number }; base: { desde: string; hasta: string; escenas_validas: number } };
  indicadores: Indicador[];
  nivel_general: Nivel;
  series: { reciente: any[]; base: any[] };
  metodo: string;
}

interface Instalacion {
  codigo_sig: string;
  nombre_oficial: string;
  latitud_oficial: number;
  longitud_oficial: number;
}

interface ResultadoDerrame {
  tipo: "suelo" | "agua";
  nivel: Nivel;
  lectura: string;
  area_candidata_m2: number;
  area_analizada_m2: number;
  area_descartada_m2?: number;
  mancha_minima_m2?: number;
  manchas?: { area_m2: number; lat: number; lon: number }[];
  periodo: { desde: string; hasta: string; corte: string | null };
  metodo: string;
}

/** Guía para leer la imagen de derrames, la misma en pantalla y en el PDF */
const comoLeer = (tipo: "suelo" | "agua", min = tipo === "agua" ? 2000 : 800): { color?: string; texto: string }[] =>
  tipo === "agua"
    ? [
        { color: "#2673D9", texto: "Azul: agua permanente que el radar analizó (lo que estuvo con agua en las pasadas de los últimos 36 días)." },
        { color: "#FF2619", texto: `Rojo: manchas continuas de al menos ${min.toLocaleString("es-AR")} m² donde el agua se vio mucho más lisa (oscura) en la última pasada. Son las únicas que cuentan para el resultado.` },
        { color: "#D6CEC4", texto: "Gris: puntos sueltos descartados. Es el ruido normal del radar y no indica nada." },
        { texto: "El círculo es el área elegida y toma el color del resultado; lo que queda fuera no cuenta." },
        { texto: "Una película de hidrocarburo suele ser una mancha alargada o en forma de pluma que sigue la corriente o el viento y nace en un punto: una orilla, un cruce de ducto o una instalación. Manchas pegadas a la costa en zonas protegidas del viento, o que cubren casi todo el espejo, suelen ser agua calma." },
        { texto: "Si hay rojo: revisar la imagen en color natural de esa fecha y verificar en campo o con dron." }
      ]
    : [
        { color: "#FF2619", texto: `Rojo: manchas continuas de al menos ${min.toLocaleString("es-AR")} m² de suelo que se oscureció más de un 30 % en los últimos 20 días y quedó oscuro. Son las que cuentan para el resultado.` },
        { color: "#FFB333", texto: "Naranja: oscurecimiento leve; conviene mirarlo pero no suma al resultado." },
        { color: "#D6CEC4", texto: "Gris: puntos sueltos descartados (ruido o bordes de nube)." },
        { texto: "El círculo es el área elegida y toma el color del resultado; lo que queda fuera no cuenta." },
        { texto: "Un derrame suele tener forma irregular y estar junto a una instalación, un ducto o un camino. Un rectángulo de bordes rectos suele ser obra (locación nueva, membrana, asfalto); manchas extensas después de una lluvia suelen ser humedad." },
        { texto: "Si hay rojo: revisar la imagen en color natural y verificar en campo." }
      ];

const COLOR_NIVEL: Record<Nivel, string> = { alerta: "#FF5A3D", observar: "#F2C14E", normal: "#7FD6A0", sin_datos: "#A89C8C" };
const TEXTO_NIVEL: Record<Nivel, string> = { alerta: "Alerta", observar: "Observar", normal: "Sin cambios", sin_datos: "Sin datos" };

const SERIES = [
  { k: "ndwi", nombre: "Agua (MNDWI)" },
  { k: "ndmi", nombre: "Humedad (NDMI)" },
  { k: "ndvi", nombre: "Vegetación (NDVI)" },
  { k: "bsi", nombre: "Suelo desnudo (BSI)" },
  { k: "nbr", nombre: "Quemado (NBR)" }
];

export default function SueloAgua() {
  const mapRef = useRef<MLMap | null>(null);
  const [listo, setListo] = useState(false);
  const [punto, setPunto] = useState<{ lat: number; lon: number; nombre?: string } | null>(null);
  const [radio, setRadio] = useState(500);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [serie, setSerie] = useState("ndwi");
  const [catastroPropio, setCatastro] = useState<Instalacion[]>([]);
  const sig = useSigNeuquen();
  const [fuenteLote, setFuenteLote] = useState<"sumideros" | "instalaciones" | "propio">("sumideros");
  const [operadorLote, setOperadorLote] = useState("todas");
  const { puede } = useSesion();
  const iny = useInyeccion();
  const verIny = puede("instalaciones.nacion") || puede("instalaciones.tabla");
  const datoIny = (id: any) => {
    const p = iny && id != null ? iny.pozos[String(id)] : undefined;
    if (!p || !iny || !verIny) return undefined;
    const l = leerIny(p, iny);
    return { color: COHERENCIA[l.aviso].color, texto: `${COHERENCIA[l.aviso].nombre} · ${l.total.toLocaleString("es-AR")} m³ en el año` };
  };
  const listaFuente: (Instalacion & { operador?: string | null; iny?: { color: string; texto: string } })[] =
    fuenteLote === "propio" ? catastroPropio
    : fuenteLote === "sumideros"
      ? sig.sumideros.filter((x) => x.estado !== "Abandonado")
          .map((x, i) => ({ codigo_sig: `sum-${i}-${x.nombre}`, nombre_oficial: `${x.nombre ?? "Sumidero"} · ${x.area ?? ""}`, latitud_oficial: x.lat, longitud_oficial: x.lon, operador: x.operador, iny: datoIny(x.id_nacion) }))
          .sort((a, b) => (a.operador ?? "").localeCompare(b.operador ?? "", "es") || a.nombre_oficial.localeCompare(b.nombre_oficial, "es"))
      : sig.instalaciones.map((x, i) => ({ codigo_sig: x.id ?? `inst-${i}`, nombre_oficial: `${x.nombre ?? x.sigla ?? "Instalación"} · ${x.tipo ?? ""}`, latitud_oficial: x.lat, longitud_oficial: x.lon, operador: x.operador }));
  const operadoresLote = [...new Set(listaFuente.map((x) => x.operador).filter(Boolean) as string[])].sort();
  const [buscarLote, setBuscarLote] = useState("");
  const catastro = listaFuente.filter((x) => operadorLote === "todas" || x.operador === operadorLote);
  const visiblesLote = buscarLote.trim()
    ? catastro.filter((c) => `${c.nombre_oficial} ${c.operador ?? ""}`.toLowerCase().includes(buscarLote.trim().toLowerCase()))
    : catastro;
  const [lote, setLote] = useState<{ inst: Instalacion; nivel: Nivel | "error"; detalle?: string }[]>([]);
  const [loteCorriendo, setLoteCorriendo] = useState(false);
  const [tanda, setTanda] = useState({ desde: 0, n: 0 });
  const [pausa, setPausa] = useState(false);
  const modos = ([["cambios", "Cambios"], ["derrames", "Derrames"], ["barrido", "Barridos"]] as const).filter(([id]) =>
    id === "cambios" ? puede("suelo.cambios") : id === "derrames" ? puede("suelo.derrame_suelo") || puede("suelo.derrame_agua") : puede("suelo.barridos"));
  const tiposDerrame = ([["suelo", "En suelo", "Sentinel-2, 20 m"], ["agua", "En agua", "Radar Sentinel-1, 10 m"]] as const).filter(([id]) => puede(`suelo.derrame_${id}`));
  const [modo, setModo] = useState<"cambios" | "derrames" | "barrido">("cambios");
  const [tipoDerrame, setTipoDerrame] = useState<"suelo" | "agua">("suelo");
  // Si el modo o el tipo elegido no está habilitado para el usuario, pasar al primero que sí
  const clavesModos = modos.map(([id]) => id).join(), clavesTipos = tiposDerrame.map(([id]) => id).join();
  useEffect(() => { if (modos.length && !modos.some(([id]) => id === modo)) setModo(modos[0][0]); }, [clavesModos]);
  useEffect(() => { if (tiposDerrame.length && !tiposDerrame.some(([id]) => id === tipoDerrame)) setTipoDerrame(tiposDerrame[0][0]); }, [clavesTipos]);
  const [resDerrame, setResDerrame] = useState<ResultadoDerrame | null>(null);

  const analizarDerrame = async () => {
    if (!punto) return;
    const map = mapRef.current;
    if (map && map.getZoom() < 12.5) map.flyTo({ center: [punto.lon, punto.lat], zoom: 13.5, duration: 1200 });
    setCargando(true);
    setError(null);
    setResDerrame(null);
    try {
      const r = await fetch(`/api/derrames?tipo=${tipoDerrame}&lat=${punto.lat.toFixed(5)}&lon=${punto.lon.toFixed(5)}&radio=${radio}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
      setResDerrame(d);
      // Capa con los píxeles candidatos
      const img = await fetch(d.imagen.url);
      if (img.ok && map) {
        const url = URL.createObjectURL(await img.blob());
        const [w, so, e, n] = d.imagen.bbox;
        const coords: [[number, number], [number, number], [number, number], [number, number]] = [[w, n], [e, n], [e, so], [w, so]];
        const src = map.getSource("derrame-img") as maplibregl.ImageSource | undefined;
        if (src) src.updateImage({ url, coordinates: coords });
        else {
          map.addSource("derrame-img", { type: "image", url, coordinates: coords });
          map.addLayer({ id: "derrame-img", type: "raster", source: "derrame-img", paint: { "raster-opacity": 1, "raster-resampling": "nearest" } });
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    fetch("/api/geoportal/instalaciones").then((r) => r.json()).then((d) => setCatastro(d.instalaciones || [])).catch(() => {});
  }, []);

  // Click en el mapa para elegir punto
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    const h = (e: maplibregl.MapMouseEvent) => setPunto({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    map.on("click", h);
    map.getCanvas().style.cursor = "crosshair";
    return () => { map.off("click", h); };
  }, [listo]);

  // Dibujar área de análisis
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listo) return;
    const color = res ? COLOR_NIVEL[res.nivel_general] : "#8FE3F0";
    setGeo(map, "area-analisis", {
      type: "FeatureCollection",
      features: punto ? [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [circuloKm(punto.lat, punto.lon, radio / 1000)] } }] : []
    });
    if (!map.getLayer("area-analisis")) {
      map.addLayer({ id: "area-analisis", type: "fill", source: "area-analisis", paint: { "fill-color": color, "fill-opacity": 0.15 } });
      map.addLayer({ id: "area-analisis-borde", type: "line", source: "area-analisis", paint: { "line-color": color, "line-width": 2 } });
    } else {
      map.setPaintProperty("area-analisis", "fill-color", color);
      map.setPaintProperty("area-analisis-borde", "line-color", color);
    }
    // Instalaciones del catastro
    setGeo(map, "catastro-sa", {
      type: "FeatureCollection",
      features: catastro.map((c) => {
        const r = lote.find((l) => l.inst.codigo_sig === c.codigo_sig);
        return { type: "Feature", properties: { color: r && r.nivel !== "error" ? COLOR_NIVEL[r.nivel] : "#C9A46A" }, geometry: { type: "Point", coordinates: [c.longitud_oficial, c.latitud_oficial] } };
      })
    });
    if (!map.getLayer("catastro-sa")) {
      map.addLayer({ id: "catastro-sa", type: "circle", source: "catastro-sa", paint: { "circle-radius": 5, "circle-color": ["get", "color"], "circle-stroke-color": "#12100E", "circle-stroke-width": 1.5 } });
    }
  }, [punto, radio, res, listo, catastro, lote]);

  const analizar = async (p = punto, r = radio) => {
    if (!p) return;
    const map = mapRef.current;
    if (map && map.getZoom() < 12.5) map.flyTo({ center: [p.lon, p.lat], zoom: 13.5, duration: 1200 });
    setCargando(true);
    setError(null);
    setRes(null);
    try {
      const resp = await fetch(`/api/analisis/suelo-agua?lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}&radio=${r}`);
      const d = await resp.json();
      if (!resp.ok) throw new Error(d.error || `Error ${resp.status}`);
      setRes(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  const lugar = () => (punto ? `${punto.nombre ? punto.nombre + ", " : ""}${punto.lat.toFixed(5)}°, ${punto.lon.toFixed(5)}°, radio ${radio} m` : "");
  const fotoMapa = async () => { try { return mapRef.current ? await capturarMapa(mapRef.current) : undefined; } catch { return undefined; } };

  const exportarCambios = async () => {
    if (!res) return;
    const mapa = await fotoMapa();
    const fmt = (v: number | null, u?: string) => (v === null ? "N/D" : u ? v.toFixed(1) : v.toFixed(3));
    generarInformePDF({
      titulo: "Análisis satelital de suelo y agua",
      subtitulo: `${lugar()}. Resultado general: ${TEXTO_NIVEL[res.nivel_general]}.`,
      mapa,
      leyenda: [{ color: COLOR_NIVEL[res.nivel_general], texto: "Área analizada (color según resultado)" }, { color: "#C9A46A", texto: "Instalación del catastro", forma: "circulo" }],
      secciones: [
        { titulo: "Períodos comparados", texto: [`Reciente: ${res.periodos.reciente.desde} a ${res.periodos.reciente.hasta} (${res.periodos.reciente.escenas_validas} compuestos sin nubes). Base: ${res.periodos.base.desde} a ${res.periodos.base.hasta} (${res.periodos.base.escenas_validas}).`] },
        {
          titulo: "Indicadores",
          tabla: {
            columnas: ["Indicador", "Año anterior", "Ahora", "Unidad", "Resultado", "Lectura"],
            filas: res.indicadores.map((i) => [i.nombre, fmt(i.base, i.unidad), fmt(i.reciente, i.unidad), i.unidad || "índice", TEXTO_NIVEL[i.nivel], i.lectura])
          }
        },
        {
          titulo: "Serie de compuestos (últimos 60 días)",
          tabla: {
            columnas: ["Fecha", "NDVI", "MNDWI", "NDMI", "BSI", "NBR", "% agua", "% suelo desnudo"],
            filas: res.series.reciente.map((f: any) => [f.fecha, f.ndvi?.toFixed(3) ?? "-", f.ndwi?.toFixed(3) ?? "-", f.ndmi?.toFixed(3) ?? "-", f.bsi?.toFixed(3) ?? "-", f.nbr?.toFixed(3) ?? "-", f.agua !== null ? (f.agua * 100).toFixed(2) : "-", f.desnudo !== null ? (f.desnudo * 100).toFixed(2) : "-"])
          }
        }
      ],
      metodo: res.metodo,
      archivo: nombreArchivo("informe-suelo-agua", "pdf")
    });
  };

  const exportarDerrame = async () => {
    if (!resDerrame) return;
    const mapa = await fotoMapa();
    const leyenda: ItemLeyenda[] = [{ color: "#FF2619", texto: "Mancha continua candidata" }];
    if (resDerrame.tipo === "suelo") leyenda.push({ color: "#FFB333", texto: "Oscurecimiento leve" });
    else leyenda.push({ color: "#2673D9", texto: "Agua analizada" });
    leyenda.push({ color: "#D6CEC4", texto: "Punto suelto descartado (ruido)" });
    generarInformePDF({
      titulo: resDerrame.tipo === "suelo" ? "Búsqueda de derrame en suelo" : "Búsqueda de mancha en agua",
      subtitulo: `${lugar()}. Resultado: ${resDerrame.nivel === "normal" ? "Sin indicios" : TEXTO_NIVEL[resDerrame.nivel]}.`,
      mapa,
      leyenda,
      secciones: [
        {
          titulo: "Resultado",
          tabla: {
            columnas: ["Área candidata", "Área analizada", "Período", "Nivel"],
            filas: [[`${resDerrame.area_candidata_m2.toLocaleString("es-AR")} m²`, `${(resDerrame.area_analizada_m2 / 10000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha`, `${resDerrame.periodo.desde} a ${resDerrame.periodo.hasta}${resDerrame.periodo.corte ? ` (corte ${resDerrame.periodo.corte})` : ""}`, resDerrame.nivel === "normal" ? "Sin indicios" : TEXTO_NIVEL[resDerrame.nivel]]]
          }
        },
        ...(resDerrame.manchas && resDerrame.manchas.length
          ? [{ titulo: "Manchas que cuentan", tabla: { columnas: ["Mancha", "Área (m²)", "Centro (lat, lon)"], filas: resDerrame.manchas.map((m, i) => [String(i + 1), m.area_m2.toLocaleString("es-AR"), `${m.lat}, ${m.lon}`]) } }]
          : []),
        { titulo: "Lectura", texto: [resDerrame.lectura, "Es un indicio a verificar en campo, no una confirmación."] },
        { titulo: "Cómo leer la imagen", texto: comoLeer(resDerrame.tipo, resDerrame.mancha_minima_m2).map((x) => x.texto) }
      ],
      metodo: resDerrame.metodo,
      archivo: nombreArchivo(`informe-derrame-${resDerrame.tipo}`, "pdf")
    });
  };

  const elegirInstalacion = (i: Instalacion) => {
    const p = { lat: i.latitud_oficial, lon: i.longitud_oficial, nombre: i.nombre_oficial };
    setPunto(p);
    mapRef.current?.flyTo({ center: [p.lon, p.lat], zoom: 13, duration: 1200 });
    analizar(p);
  };

  const analizarCatastro = async () => {
    setLoteCorriendo(true);
    // Tandas de 20 para cuidar el cupo de Sentinel Hub: cada clic sigue con los 20 siguientes sin analizar
    const hechos = new Set(lote.map((l) => l.inst.codigo_sig));
    const lista = catastro.filter((c) => !hechos.has(c.codigo_sig)).slice(0, TANDA);
    setTanda({ desde: lote.length, n: lista.length });
    for (const inst of lista) {
      // Hasta 3 intentos: si Sentinel Hub limita por minuto, se espera y se reintenta el mismo punto
      for (let intento = 0; ; intento++) {
        try {
          const r = await fetch(`/api/analisis/suelo-agua?lat=${inst.latitud_oficial.toFixed(4)}&lon=${inst.longitud_oficial.toFixed(4)}&radio=${radio}`);
          const d = await r.json();
          if (!r.ok) throw new Error(d.error);
          const peor = (d.indicadores as Indicador[]).filter((x) => x.nivel === d.nivel_general).map((x) => x.nombre).join(", ");
          setLote((prev) => [...prev, { inst, nivel: d.nivel_general, detalle: d.nivel_general === "normal" ? undefined : peor }]);
          break;
        } catch (e: any) {
          const limite = /limitando|429|rate limit/i.test(e.message || "");
          if (limite && intento < 2) { setPausa(true); await new Promise((ok) => setTimeout(ok, 45000)); setPausa(false); continue; }
          setLote((prev) => [...prev, { inst, nivel: "error", detalle: e.message }]);
          break;
        }
      }
      await new Promise((ok) => setTimeout(ok, 1500)); // ritmo que entra en el cupo por minuto
    }
    setLoteCorriendo(false);
  };

  return (
    <div className="flex flex-col lg:flex-row lg:min-h-screen">
      <section className="tema-noche bg-noche relative h-[55vh] lg:h-screen lg:flex-1 lg:sticky lg:top-0" aria-label="Mapa para elegir el área de análisis">
        <Globo centro={[-68.95, -38.3]} zoom={8} onListo={(m) => { mapRef.current = m; setListo(true); }}
          tituloExport={modo === "cambios" ? "Análisis de suelo y agua" : "Búsqueda de derrames"}
          subtituloExport={punto ? `${punto.lat.toFixed(4)}°, ${punto.lon.toFixed(4)}°, radio ${radio} m` : undefined}
          leyendaExport={modo === "derrames" ? [{ color: "#FF2619", texto: "Mancha continua candidata" }, { color: "#D6CEC4", texto: "Punto suelto descartado (ruido)" }, { color: "#C9A46A", texto: "Instalación del catastro", forma: "circulo" }] : [{ color: "#C9A46A", texto: "Instalación del catastro", forma: "circulo" }]} />
        <div className="absolute left-4 top-4 right-4 sm:right-auto instrumento px-4 py-3 max-w-sm pointer-events-none">
          <p className="flex items-center gap-2 text-sm"><Crosshair className="w-4 h-4 text-hielo" /> Tocá el mapa para elegir el punto a analizar</p>
          {punto && <p className="num text-xs text-tenue mt-1">{punto.nombre ? `${punto.nombre}, ` : ""}{punto.lat.toFixed(4)}°, {punto.lon.toFixed(4)}°</p>}
        </div>
      </section>

      <aside className="lg:w-[460px] border-l border-linea bg-panel/60">
        <div className="p-5 border-b border-linea">
          <h1 className="titulo text-4xl font-semibold">Suelo y agua</h1>
          <p className="text-sm text-tenue mt-1">
            Compara las imágenes Sentinel-2 de los últimos 60 días con el mismo período del año pasado y marca cambios de agua superficial, humedad del suelo, suelo descubierto y vegetación.
          </p>
        </div>

        {modos.length > 1 && <div className="px-5 pt-4 flex gap-1" role="tablist" aria-label="Tipo de análisis">
          {modos.map(([id, txt]) => (
            <button key={id} role="tab" aria-selected={modo === id} onClick={() => { setModo(id); setError(null); }}
              className={`flex-1 px-3 py-2 text-sm border-b-2 ${modo === id ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>{txt}</button>
          ))}
        </div>}

        {modo === "derrames" && (
          <div className="px-5 pt-4 space-y-3">
            <div className={`grid gap-2 ${tiposDerrame.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {tiposDerrame.map(([id, t, sub]) => (
                <button key={id} onClick={() => setTipoDerrame(id)} aria-pressed={tipoDerrame === id}
                  className={`text-left px-3 py-2 border ${tipoDerrame === id ? "border-llama" : "border-linea"}`}>
                  <span className={`block font-medium ${tipoDerrame === id ? "text-llama" : ""}`}>{t}</span>
                  <span className="block text-xs text-tenue">{sub}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-tenue leading-relaxed">
              {tipoDerrame === "suelo"
                ? "Busca píxeles que se oscurecieron bruscamente en los últimos 20 días y quedaron oscuros, como el suelo empapado de crudo. Detecta manchas desde unos 800 m²."
                : "Elegí un punto sobre el río, embalse o una pileta. Busca zonas del agua que en la última pasada de radar aparecen mucho más lisas (oscuras) que lo habitual, como ocurre con una película de hidrocarburo."}
            </p>
          </div>
        )}

        {modo === "barrido" && listo && modos.length > 0 && <BarridoRio map={mapRef.current!} />}

        <div className={`p-5 border-b border-linea space-y-4 ${modo === "barrido" || !modos.length ? "hidden" : ""}`}>
          <div>
            <p className="text-xs text-tenue mb-1.5">Radio del área</p>
            <div className="flex gap-1.5 flex-wrap">
              {[250, 500, 1000, 2000].map((r) => (
                <button key={r} onClick={() => setRadio(r)} aria-pressed={radio === r}
                  className={`px-2.5 py-1 num text-xs border ${radio === r ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>{r >= 1000 ? `${r / 1000} km` : `${r} m`}</button>
              ))}
            </div>
          </div>
          <button onClick={() => (modo === "cambios" ? analizar() : analizarDerrame())} disabled={!punto || cargando}
            className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 font-semibold ${!punto ? "border border-dashed border-hielo text-hielo bg-transparent cursor-default" : `text-noche disabled:opacity-60 ${modo === "cambios" ? "bg-hielo" : "bg-llama"}`}`}>
            {!punto && !cargando && <Crosshair className="w-4 h-4" />}
            {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
            {cargando ? "Analizando imágenes…" : !punto ? "Elegí un punto en el mapa" : modo === "cambios" ? "Analizar este punto" : `Buscar derrame ${tipoDerrame === "suelo" ? "en suelo" : "en agua"}`}
          </button>
          {error && <p className="text-xs text-llama">{error}</p>}
        </div>

        {modo === "cambios" && res && (
          <>
            <div className="px-5 pt-4"><BotonPdf onClick={exportarCambios} /></div>
            <Informe res={res} serie={serie} setSerie={setSerie} />
          </>
        )}
        {modo === "derrames" && resDerrame && (
          <>
            <div className="px-5 pt-4"><BotonPdf onClick={exportarDerrame} /></div>
            <InformeDerrame r={resDerrame} />
          </>
        )}

        {puede("suelo.lote") && <div className="p-5 border-t border-linea">
          <h2 className="titulo text-2xl font-semibold flex items-center gap-2"><ListChecks className="w-5 h-5 text-lutita" /> Análisis por instalación</h2>
          <p className="text-sm text-tenue mt-1">Corre el análisis de cambios sobre los puntos del registro provincial de Neuquén, en tandas de {TANDA} para no agotar el cupo satelital.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="flex text-xs border border-linea" role="group" aria-label="Qué analizar">
              {([["sumideros", "Sumideros"], ["instalaciones", "Instalaciones"], ["propio", "Mi KML"]] as const).map(([id, txt]) => (
                <button key={id} onClick={() => { setFuenteLote(id); setOperadorLote("todas"); setLote([]); }} aria-pressed={fuenteLote === id}
                  className={`px-2.5 py-1.5 ${fuenteLote === id ? "bg-lutita text-noche" : "text-lutita hover:bg-noche/50"}`}>{txt}</button>
              ))}
            </div>
            {operadoresLote.length > 1 && (
              <select value={operadorLote} onChange={(e) => { setOperadorLote(e.target.value); setLote([]); }} className="flex-1 min-w-[160px] bg-noche border border-linea text-xs px-2 py-1.5" aria-label="Operadora">
                <option value="todas">Todas las operadoras</option>
                {operadoresLote.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
          </div>
          {catastro.length === 0 ? (
            <p className="text-sm text-tenue mt-3">{fuenteLote === "propio" ? "Todavía no cargaste un KML propio. Podés subirlo en la pantalla Focos." : sig.cargando ? "Cargando el registro provincial…" : "No hay puntos para este filtro."}</p>
          ) : (
            <>
              {(() => {
                const tipo = fuenteLote === "sumideros" ? "sumideros" : "instalaciones";
                const hechos = lote.length, total = catastro.length, resta = Math.min(TANDA, total - hechos);
                return (
                  <>
                    <p className="text-sm mt-3"><span className="num">{total}</span> {tipo} en el registro{operadorLote !== "todas" ? ` de ${operadorLote}` : ""}{hechos ? <>, <span className="num">{hechos}</span> analizados</> : null}.</p>
                    {resta > 0 && (
                      <button onClick={analizarCatastro} disabled={loteCorriendo}
                        className="mt-2 flex items-center gap-2 px-3 py-2 text-sm border border-lutita text-lutita disabled:opacity-60">
                        {loteCorriendo && <Loader2 className="w-4 h-4 animate-spin" />}
                        {loteCorriendo
                          ? pausa ? "Esperando cupo de Sentinel Hub (un minuto)…" : `Analizando ${Math.min(hechos - tanda.desde + 1, tanda.n)} de ${tanda.n}…`
                          : `${hechos ? "Seguir con" : "Analizar"} ${tipo} ${hechos + 1} a ${hechos + resta} de ${total} (radio ${radio} m)`}
                      </button>
                    )}
                  </>
                );
              })()}
              {catastro.length > 8 && (
                <input type="search" value={buscarLote} onChange={(e) => setBuscarLote(e.target.value)} placeholder="Buscar por nombre o área"
                  className="mt-3 w-full bg-noche border border-linea text-sm px-3 py-2" aria-label="Buscar en la lista" />
              )}
              <ul className="mt-3 divide-y divide-linea">
                {visiblesLote.slice(0, 300).map((c) => {
                  const r = lote.find((l) => l.inst.codigo_sig === c.codigo_sig);
                  return (
                    <li key={c.codigo_sig}>
                      <button onClick={() => elegirInstalacion(c)} className="w-full text-left py-2.5 flex items-start gap-3 hover:bg-noche/40 px-1">
                        <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r && r.nivel !== "error" ? COLOR_NIVEL[r.nivel] : "var(--color-linea-fuerte)" }} />
                        <span className="flex-1">
                          <span className="block text-sm">{c.nombre_oficial}</span>
                          {(c.operador || (c as any).iny) && <span className="flex items-center gap-1.5 text-[11px] text-tenue">
                            {(c as any).iny && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: (c as any).iny.color }} />}
                            {[c.operador, (c as any).iny?.texto].filter(Boolean).join(" · ")}
                          </span>}
                          {r && <span className="block text-xs text-tenue">{r.nivel === "error" ? `Error: ${r.detalle}` : TEXTO_NIVEL[r.nivel]}{r.detalle && r.nivel !== "error" ? `: ${r.detalle}` : ""}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>}
      </aside>
    </div>
  );
}

function Informe({ res, serie, setSerie }: { res: Resultado; serie: string; setSerie: (s: string) => void }) {
  const fmt = (v: number | null, unidad?: string) => (v === null ? "N/D" : unidad ? `${v.toFixed(1)}` : v.toFixed(3));
  return (
    <div className="p-5 space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="titulo text-2xl font-semibold">Resultado</h2>
        <span className="px-2.5 py-1 text-sm font-semibold" style={{ background: COLOR_NIVEL[res.nivel_general], color: "#12100E" }}>{TEXTO_NIVEL[res.nivel_general]}</span>
      </div>
      <p className="num text-[11px] text-tenue">
        Reciente {res.periodos.reciente.desde} a {res.periodos.reciente.hasta} ({res.periodos.reciente.escenas_validas} compuestos sin nubes). Base {res.periodos.base.desde} a {res.periodos.base.hasta} ({res.periodos.base.escenas_validas}).
      </p>

      <div className="space-y-2.5">
        {res.indicadores.map((i) => (
          <div key={i.id} className="instrumento p-3.5" style={{ borderLeft: `3px solid ${COLOR_NIVEL[i.nivel]}` }}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{i.nombre}</span>
              <span className="text-xs" style={{ color: COLOR_NIVEL[i.nivel] }}>{TEXTO_NIVEL[i.nivel]}</span>
            </div>
            <p className="num text-xs text-tenue mt-1">
              año anterior {fmt(i.base, i.unidad)} → ahora {fmt(i.reciente, i.unidad)}{i.unidad ? ` ${i.unidad}` : ""}
            </p>
            <p className="text-sm mt-1.5 leading-snug">{i.lectura}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="flex gap-1.5 flex-wrap">
          {SERIES.map((s) => (
            <button key={s.k} onClick={() => setSerie(s.k)} aria-pressed={serie === s.k}
              className={`px-2 py-1 text-xs border ${serie === s.k ? "border-hielo text-hielo" : "border-linea text-tenue"}`}>{s.nombre}</button>
          ))}
        </div>
        <Grafico base={res.series.base} reciente={res.series.reciente} k={serie} />
        <p className="text-[11px] text-tenue">Línea celeste: últimos 60 días. Línea ocre punteada: mismo período del año anterior.</p>
      </div>
      <p className="text-[11px] text-tenue leading-relaxed">{res.metodo}</p>
    </div>
  );
}

function Grafico({ base, reciente, k }: { base: any[]; reciente: any[]; k: string }) {
  const W = 400, H = 150, P = 28;
  const todos = [...base, ...reciente].map((f) => f[k]).filter((v) => v !== null && Number.isFinite(v));
  if (todos.length < 2) return <p className="text-xs text-tenue my-4">Pocos datos sin nubes para graficar.</p>;
  let min = Math.min(...todos), max = Math.max(...todos);
  if (max - min < 0.02) { max += 0.01; min -= 0.01; }
  const x = (f: any, serie: any[]) => {
    const t0 = new Date(serie[0]?.fecha).getTime();
    const dia = (new Date(f.fecha).getTime() - t0) / 86400000;
    return P + (Math.max(0, Math.min(60, dia)) / 60) * (W - P - 8);
  };
  const y = (v: number) => H - 20 - ((v - min) / (max - min)) * (H - 34);
  const linea = (serie: any[]) => serie.filter((f) => f[k] !== null).map((f, i) => `${i ? "L" : "M"}${x(f, serie).toFixed(1)},${y(f[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3" role="img" aria-label="Evolución del índice en los dos períodos">
      {[min, (min + max) / 2, max].map((v) => (
        <g key={v}>
          <line x1={P} x2={W - 8} y1={y(v)} y2={y(v)} strokeWidth="0.5" style={{ stroke: "var(--color-linea)" }} />
          <text x={P - 4} y={y(v) + 3} fontSize="9" textAnchor="end" fontFamily="IBM Plex Mono" style={{ fill: "var(--color-tenue)" }}>{v.toFixed(2)}</text>
        </g>
      ))}
      <text x={P} y={H - 4} fontSize="9" fontFamily="IBM Plex Mono" style={{ fill: "var(--color-tenue)" }}>día 0</text>
      <text x={W - 8} y={H - 4} fontSize="9" textAnchor="end" fontFamily="IBM Plex Mono" style={{ fill: "var(--color-tenue)" }}>día 60</text>
      <path d={linea(base)} fill="none" strokeWidth="1.5" strokeDasharray="4 3" style={{ stroke: "var(--color-hielo)" }} />
      <path d={linea(reciente)} fill="none" strokeWidth="2" style={{ stroke: "var(--color-agua)" }} />
      {reciente.filter((f) => f[k] !== null).map((f) => <circle key={f.fecha} cx={x(f, reciente)} cy={y(f[k])} r="2.5" style={{ fill: "var(--color-agua)" }} />)}
    </svg>
  );
}

function InformeDerrame({ r }: { r: ResultadoDerrame }) {
  return (
    <div className="p-5 space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="titulo text-2xl font-semibold">{r.tipo === "suelo" ? "Derrame en suelo" : "Mancha en agua"}</h2>
        <span className="px-2.5 py-1 text-sm font-semibold" style={{ background: COLOR_NIVEL[r.nivel], color: "#12100E" }}>
          {r.nivel === "normal" ? "Sin indicios" : TEXTO_NIVEL[r.nivel]}
        </span>
      </div>
      <div className="flex gap-6">
        <div>
          <p className="num text-3xl text-llama leading-none">{r.area_candidata_m2.toLocaleString("es-AR")}</p>
          <p className="text-xs text-tenue mt-1">m² en manchas continuas</p>
        </div>
        <div>
          <p className="num text-xl leading-none">{(r.area_analizada_m2 / 10000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}</p>
          <p className="text-xs text-tenue mt-1">ha analizadas {r.tipo === "agua" ? "(solo agua)" : "(con datos)"}</p>
        </div>
      </div>
      <p className="text-sm leading-snug">{r.lectura}</p>
      {r.manchas && r.manchas.length > 0 && (
        <ul className="text-xs space-y-1">
          {r.manchas.map((m, i) => (
            <li key={i} className="flex justify-between gap-3"><span>Mancha {i + 1}</span><span className="num text-tenue">{m.area_m2.toLocaleString("es-AR")} m² · {m.lat}, {m.lon}</span></li>
          ))}
        </ul>
      )}
      <details className="border border-linea" open>
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Cómo leer esta imagen</summary>
        <ul className="px-3 pb-3 space-y-2 text-xs leading-relaxed">
          {comoLeer(r.tipo, r.mancha_minima_m2).map((x, i) => (
            <li key={i} className="flex gap-2">
              {x.color ? <span className="mt-1 w-3 h-3 shrink-0" style={{ background: x.color }} /> : <span className="mt-1 w-3 h-3 shrink-0" />}
              <span className={x.color ? "" : "text-tenue"}>{x.texto}</span>
            </li>
          ))}
        </ul>
      </details>
      <p className="num text-[11px] text-tenue">
        Período {r.periodo.desde} a {r.periodo.hasta}{r.periodo.corte ? `, comparando antes y después del ${r.periodo.corte}` : ""}.
      </p>
      <p className="text-[11px] text-tenue leading-relaxed">{r.metodo} Es un indicio a verificar en campo, no una confirmación.</p>
    </div>
  );
}

function BotonPdf({ onClick }: { onClick: () => void }) {
  const { puede } = useSesion();
  if (!puede("suelo.exportar")) return null;
  return (
    <button onClick={onClick} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-lutita text-lutita hover:bg-noche/40">
      <FileDown className="w-4 h-4" /> Exportar informe PDF
    </button>
  );
}

// ---------------------------------------------------------------------------
// Barrido del río Neuquén en la zona de Añelo
// ---------------------------------------------------------------------------
interface Tramo { n: number; km_desde_ref?: number; km_costa?: number; lat: number; lon: number }

const ZONAS = [
  { id: "anelo", corto: "Río Neuquén, Añelo" },
  { id: "rincon", corto: "Río Colorado, Rincón de los Sauces" },
  { id: "marimenuco", corto: "Costa lago Mari Menuco" },
  { id: "barreales", corto: "Costa lago Los Barreales" }
];
interface ResTramo {
  agua?: Indicador;
  humedad?: Indicador;
  mancha?: { nivel: Nivel; area: number };
  nivel: Nivel | "pendiente" | "error";
  error?: string;
}

const TANDA = 20;

function BarridoRio({ map }: { map: MLMap }) {
  const [zona, setZona] = useState("anelo");
  const [meta, setMeta] = useState<{ nombre: string; tipo: "rio" | "costa"; referencia: { nombre: string }; perimetro_km?: number } | null>(null);
  const [tramos, setTramos] = useState<Tramo[]>([]);
  const [res, setRes] = useState<Record<number, ResTramo>>({});
  const [corriendo, setCorriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuente, setFuente] = useState("");
  const cancelar = useRef(false);

  const dibujar = (ts: Tramo[], rs: Record<number, ResTramo>) => {
    setGeo(map, "barrido", {
      type: "FeatureCollection",
      features: ts.map((t) => {
        const r = rs[t.n];
        const color = !r || r.nivel === "pendiente" ? "#A89C8C" : r.nivel === "error" ? "#55606E" : COLOR_NIVEL[r.nivel];
        return { type: "Feature", properties: { color, n: String(t.n) }, geometry: { type: "Polygon", coordinates: [circuloKm(t.lat, t.lon, 1)] } };
      })
    });
    if (!map.getLayer("barrido")) {
      map.addLayer({ id: "barrido", type: "fill", source: "barrido", paint: { "fill-color": ["get", "color"], "fill-opacity": 0.22 } });
      map.addLayer({ id: "barrido-borde", type: "line", source: "barrido", paint: { "line-color": ["get", "color"], "line-width": 2 } });
    }
  };

  const iniciar = async () => {
    setError(null);
    setCorriendo(true);
    cancelar.current = false;
    try {
      // OpenStreetMap se consulta desde el navegador (con caché de 7 días); el servidor es el respaldo
      // Orden: caché local → trazado fijo del sitio → servidor (IGN) → OpenStreetMap desde el navegador
      const servidor = async () => {
        const r = await fetch(`/api/barrido/${zona}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        return j;
      };
      const d: any = await conCache(`barrido-${zona}-v4`, () => barridoFijo(zona).catch(servidor), () =>
        obtenerBarrido(zona).catch(() => { throw new Error("No se pudo obtener el trazado del cauce. Probá de nuevo en unos minutos."); })
      );
      const ts: Tramo[] = d.tramos;
      setTramos(ts);
      setFuente(d.fuente);
      setMeta({ nombre: d.nombre, tipo: d.tipo, referencia: d.referencia, perimetro_km: d.perimetro_km });
      const inicial: Record<number, ResTramo> = {};
      ts.forEach((t) => { inicial[t.n] = { nivel: "pendiente" }; });
      setRes(inicial);
      dibujar(ts, inicial);
      const lons = ts.map((t) => t.lon), lats = ts.map((t) => t.lat);
      map.fitBounds([[Math.min(...lons) - 0.03, Math.min(...lats) - 0.03], [Math.max(...lons) + 0.03, Math.max(...lats) + 0.03]], { padding: 30, duration: 1200 });

      const acumulado = { ...inicial };
      const cola = [...ts];
      const trabajador = async () => {
        while (cola.length && !cancelar.current) {
          const t = cola.shift()!;
          try {
            const [a, b] = await Promise.all([
              fetch(`/api/analisis/suelo-agua?lat=${t.lat.toFixed(5)}&lon=${t.lon.toFixed(5)}&radio=1000`).then((x) => x.json()),
              fetch(`/api/derrames?tipo=agua&lat=${t.lat.toFixed(5)}&lon=${t.lon.toFixed(5)}&radio=1000`).then((x) => x.json())
            ]);
            if (a.error && b.error) throw new Error(a.error);
            const agua = a.indicadores?.find((i: Indicador) => i.id === "agua");
            const humedad = a.indicadores?.find((i: Indicador) => i.id === "humedad");
            const mancha = b.error ? undefined : { nivel: b.nivel as Nivel, area: b.area_candidata_m2 as number };
            const orden: Record<string, number> = { sin_datos: 0, normal: 1, observar: 2, alerta: 3 };
            const niveles = [agua?.nivel, humedad?.nivel, mancha?.nivel].filter(Boolean) as Nivel[];
            const peor = niveles.reduce<Nivel>((acc, n) => (orden[n] > orden[acc] ? n : acc), "sin_datos");
            acumulado[t.n] = { agua, humedad, mancha, nivel: peor };
          } catch (e: any) {
            acumulado[t.n] = { nivel: "error", error: e.message };
          }
          setRes({ ...acumulado });
          dibujar(ts, acumulado);
        }
      };
      await Promise.all([trabajador(), trabajador()]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCorriendo(false);
    }
  };

  const etiqueta = (t: Tramo) =>
    meta?.tipo === "costa"
      ? `Punto ${t.n} de la costa (km ${t.km_costa})`
      : `${(t.km_desde_ref ?? 0) > 0 ? "+" : ""}${t.km_desde_ref} km ${(t.km_desde_ref ?? 0) < 0 ? "aguas arriba" : "aguas abajo"} de ${meta?.referencia.nombre ?? ""}`;
  const hechos = tramos.filter((t) => res[t.n] && res[t.n].nivel !== "pendiente").length;
  const fmtPct = (i?: Indicador) => (i && i.base !== null && i.reciente !== null ? `${i.base.toFixed(1)} → ${i.reciente.toFixed(1)} %` : "N/D");

  const exportar = async () => {
    let mapa: HTMLCanvasElement | undefined;
    try { mapa = await capturarMapa(map); } catch { /* sin mapa */ }
    const alertas = tramos.filter((t) => res[t.n]?.nivel === "alerta").length;
    const observar = tramos.filter((t) => res[t.n]?.nivel === "observar").length;
    generarInformePDF({
      titulo: `Barrido satelital: ${meta?.nombre ?? ""}`,
      subtitulo: meta?.tipo === "costa"
        ? `${tramos.length} puntos repartidos sobre ${meta?.perimetro_km ?? "?"} km de costa, radio 1 km. ${alertas} en alerta, ${observar} para observar.`
        : `${tramos.length} tramos de 2 km a lo largo del cauce, centrados en ${meta?.referencia.nombre}. ${alertas} en alerta, ${observar} para observar.`,
      mapa,
      leyenda: [
        { color: COLOR_NIVEL.alerta, texto: "Alerta" }, { color: COLOR_NIVEL.observar, texto: "Observar" },
        { color: COLOR_NIVEL.normal, texto: "Sin cambios" }, { color: COLOR_NIVEL.sin_datos, texto: "Sin datos" }
      ],
      secciones: [{
        titulo: meta?.tipo === "costa" ? "Resultado por punto de costa" : "Resultado por tramo (oeste a este, aguas arriba a aguas abajo)",
        tabla: {
          columnas: [meta?.tipo === "costa" ? "Punto" : "Tramo", meta?.tipo === "costa" ? "km de costa" : `km desde ${meta?.referencia.nombre ?? ""}`, "Centro (lat, lon)", "Agua superficial (año ant. → ahora)", "Humedad del suelo", "Mancha en agua (radar)", "Resultado"],
          filas: tramos.map((t) => {
            const r = res[t.n] || { nivel: "pendiente" };
            return [t.n, meta?.tipo === "costa" ? String(t.km_costa) : `${(t.km_desde_ref ?? 0) > 0 ? "+" : ""}${t.km_desde_ref}`, `${t.lat.toFixed(4)}, ${t.lon.toFixed(4)}`, fmtPct(r.agua),
              r.humedad ? TEXTO_NIVEL[r.humedad.nivel] : "N/D", r.mancha ? (r.mancha.area ? `${r.mancha.area.toLocaleString("es-AR")} m²` : "Sin manchas") : "N/D",
              r.nivel === "pendiente" ? "Pendiente" : r.nivel === "error" ? "Error" : TEXTO_NIVEL[r.nivel]];
          })
        }
      }, {
        titulo: "Hallazgos",
        texto: tramos.filter((t) => ["alerta", "observar"].includes(res[t.n]?.nivel as string)).map((t) => {
          const r = res[t.n];
          return `${etiqueta(t)}: ${[r.agua?.nivel !== "normal" ? r.agua?.lectura : "", r.humedad?.nivel !== "normal" ? r.humedad?.lectura : "", r.mancha && r.mancha.nivel !== "normal" ? `Radar: ${r.mancha.area.toLocaleString("es-AR")} m² de agua anormalmente lisa.` : ""].filter(Boolean).join(" ")}`;
        }).concat(alertas + observar === 0 ? ["Sin hallazgos en los tramos analizados."] : [])
      }],
      metodo: `${fuente}. ${meta?.tipo === "costa" ? "Cada punto es un círculo de 1 km de radio sobre la línea de costa, repartidos en partes iguales a lo largo del perímetro." : "Cada tramo es un círculo de 1 km de radio centrado en el cauce, separados 2 km a lo largo del río."} Agua superficial y humedad: Sentinel-2 L2A, últimos 60 días vs. mismo período del año anterior. Manchas en agua: Sentinel-1 radar, última pasada vs. mediana de 36 días, descontando el oscurecimiento general por viento.`,
      archivo: nombreArchivo(`barrido-${zona}`, "pdf")
    });
  };

  return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {ZONAS.map((z) => (
          <button key={z.id} onClick={() => setZona(z.id)} disabled={corriendo} aria-pressed={zona === z.id}
            className={`text-left px-3 py-2 text-sm border ${zona === z.id ? "border-hielo text-hielo" : "border-linea"}`}>{z.corto}</button>
        ))}
      </div>
      <p className="text-sm text-tenue">
        {zona === "anelo" || zona === "rincon"
          ? "Recorre el cauce en 20 tramos de 2 km, 10 aguas arriba y 10 aguas abajo de la localidad."
          : "Recorre la costa del embalse en 20 puntos repartidos en partes iguales."}{" "}
        En cada uno mide agua superficial y humedad del suelo contra el año anterior y busca manchas en el agua con radar.
      </p>
      <button onClick={iniciar} disabled={corriendo}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-hielo text-noche font-semibold disabled:opacity-60">
        {corriendo && <Loader2 className="w-4 h-4 animate-spin" />}
        {corriendo ? `Analizando ${Math.min(hechos + 1, tramos.length || 20)} de ${tramos.length || 20}…` : `Iniciar barrido: ${ZONAS.find((z) => z.id === zona)!.corto}`}
      </button>
      {corriendo && <button onClick={() => { cancelar.current = true; }} className="text-xs text-tenue underline">Detener</button>}
      {error && <p className="text-xs text-llama">{error}</p>}
      {tramos.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3 text-xs">
            {(["alerta", "observar", "normal", "sin_datos"] as Nivel[]).map((n) => (
              <span key={n} className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full" style={{ background: COLOR_NIVEL[n] }} />
                {TEXTO_NIVEL[n]}: {tramos.filter((t) => res[t.n]?.nivel === n).length}</span>
            ))}
          </div>
          {!corriendo && hechos > 0 && <BotonPdf onClick={exportar} />}
          <ul className="divide-y divide-linea border-y border-linea">
            {tramos.map((t) => {
              const r = res[t.n];
              const color = !r || r.nivel === "pendiente" ? "#3A332B" : r.nivel === "error" ? "#55606E" : COLOR_NIVEL[r.nivel];
              return (
                <li key={t.n}>
                  <button onClick={() => map.flyTo({ center: [t.lon, t.lat], zoom: 13, duration: 1000 })} className="w-full text-left py-2.5 px-1 flex gap-3 hover:bg-noche/40">
                    <span className="num text-xs w-6 text-tenue mt-0.5">{t.n}</span>
                    <span className="mt-1 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                    <span className="flex-1 text-sm">
                      <span className="block">{etiqueta(t)}</span>
                      {r && r.nivel === "pendiente" && <span className="block text-xs text-tenue">Pendiente</span>}
                      {r && r.nivel === "error" && <span className="block text-xs text-llama">Error: {r.error}</span>}
                      {r && r.agua && (
                        <span className="block text-xs text-tenue">
                          Agua {fmtPct(r.agua)} · humedad {r.humedad ? TEXTO_NIVEL[r.humedad.nivel].toLowerCase() : "N/D"} · radar {r.mancha ? (r.mancha.area ? `${r.mancha.area.toLocaleString("es-AR")} m²` : "sin manchas") : "N/D"}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-tenue">{fuente}. Tocá un tramo para ir a él en el mapa.</p>
        </>
      )}
    </div>
  );
}
