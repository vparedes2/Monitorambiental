import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileDown, MapPin, Search } from "lucide-react";
import { useSigNeuquen } from "../lib/neuquen";
import { useInyeccion, leerIny, COHERENCIA, type AvisoIny } from "../lib/inyeccion";

const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const periodo = (desde?: string, hasta?: string) => {
  if (!desde || !hasta) return "";
  const [a1, m1] = desde.split("-").map(Number), [a2, m2] = hasta.split("-").map(Number);
  return a1 === a2 ? `de ${MESES_LARGO[m1 - 1]} a ${MESES_LARGO[m2 - 1]} de ${a2}` : `de ${MESES_LARGO[m1 - 1]} de ${a1} a ${MESES_LARGO[m2 - 1]} de ${a2}`;
};
import { generarInformePDF, descargarTexto, nombreArchivo } from "../lib/exportar";
import { useSesion } from "../lib/sesion";

interface Fila {
  clave: string; nombre: string; operador: string; area: string; estado: string; origen: "Provincia" | "Solo Nación";
  total: number | null; porDia: number | null; ultimoMes: string | null; coh: AvisoIny | "sin_nacion"; lat: number; lon: number; idNacion: string | null;
}
type Col = "nombre" | "operador" | "area" | "estado" | "total" | "porDia" | "ultimoMes" | "coh";

/** Inventario de sumideros de Neuquén: registro provincial + registro nacional + inyección declarada */
export default function Sumideros() {
  const sig = useSigNeuquen();
  const iny = useInyeccion();
  const { puede } = useSesion();
  const [nacion, setNacion] = useState<any[]>([]);
  const [orden, setOrden] = useState<{ col: Col; asc: boolean }>({ col: "coh", asc: true });
  const [operador, setOperador] = useState("todas");
  const [filtroCoh, setFiltroCoh] = useState<string>("todas");
  const [buscar, setBuscar] = useState("");
  const [verAbandonados, setVerAbandonados] = useState(false);

  useEffect(() => { fetch("/capas/sumideros-nacion.geojson").then((r) => r.json()).then((g) => setNacion(g.features || [])).catch(() => {}); }, []);

  const filas = useMemo<Fila[]>(() => {
    const resumen = (id: string | null) => {
      const p = id && iny ? iny.pozos[id] : undefined;
      if (!p || !iny) return { total: null, porDia: null, ultimoMes: null, coh: "sin_nacion" as const, estadoN: null as string | null };
      const l = leerIny(p, iny);
      return { total: l.total, porDia: l.ultimoMes ? l.ultimoDia : 0, ultimoMes: l.ultimoMes, coh: l.aviso, estadoN: p.estado };
    };
    const prov: Fila[] = sig.sumideros.map((s, i) => {
      const id = s.id_nacion != null ? String(s.id_nacion) : null; const r = resumen(id);
      return { clave: `p-${i}`, nombre: s.nombre ?? "Sumidero", operador: s.operador || (id && iny?.pozos[id]?.empresa) || "", area: s.area ?? "", estado: r.estadoN ?? s.estado ?? "", origen: "Provincia", ...r, lat: s.lat, lon: s.lon, idNacion: id };
    });
    const nac: Fila[] = nacion.map((f, i) => {
      const p = f.properties; const id = String(p.id_nacion); const r = resumen(id);
      return { clave: `n-${i}`, nombre: p.nombre, operador: p.operador ?? "", area: p.area ?? "", estado: r.estadoN ?? p.estado ?? "", origen: "Solo Nación", ...r, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], idNacion: id };
    });
    return [...prov, ...nac];
  }, [sig.sumideros, nacion, iny]);

  const operadoras = [...new Set(filas.map((f) => f.operador).filter(Boolean))].sort();
  const vista = filas
    .filter((f) => verAbandonados || !/abandon/i.test(f.estado))
    .filter((f) => operador === "todas" || f.operador === operador)
    .filter((f) => filtroCoh === "todas" || f.coh === filtroCoh)
    .filter((f) => !buscar.trim() || `${f.nombre} ${f.area} ${f.operador}`.toLowerCase().includes(buscar.trim().toLowerCase()))
    .sort((a, b) => {
      const s = orden.asc ? 1 : -1;
      const va = orden.col === "coh" ? COHERENCIA[a.coh].orden : a[orden.col], vb = orden.col === "coh" ? COHERENCIA[b.coh].orden : b[orden.col];
      if (va === vb) return (b.total ?? -1) - (a.total ?? -1);
      if (va === null || va === "") return 1;
      if (vb === null || vb === "") return -1;
      return (typeof va === "number" ? va - (vb as number) : String(va).localeCompare(String(vb), "es")) * s;
    });
  const conteo = (k: string) => filas.filter((f) => (verAbandonados || !/abandon/i.test(f.estado)) && (operador === "todas" || f.operador === operador) && f.coh === k).length;
  const totalM3 = vista.reduce((s, f) => s + (f.total ?? 0), 0);

  const irMapa = (f: Fila) => {
    try { sessionStorage.setItem("ir-a-punto", JSON.stringify({ lat: f.lat, lon: f.lon, idNacion: f.idNacion, nombre: f.nombre })); } catch { /* */ }
    window.location.hash = "#/instalaciones";
  };
  const cols: [Col, string, string?][] = [["nombre", "Sumidero"], ["operador", "Operadora"], ["area", "Área"], ["estado", "Estado declarado"], ["total", "m³ en el año", "num"], ["porDia", "m³/día último mes", "num"], ["ultimoMes", "Último mes con inyección"], ["coh", "Coherencia"]];
  const tabla = () => [cols.map((c) => c[1]).concat(["Origen", "Latitud", "Longitud"]), ...vista.map((f) => [f.nombre, f.operador, f.area, f.estado, f.total ?? "", f.porDia ?? "", f.ultimoMes ?? "", COHERENCIA[f.coh].nombre, f.origen, f.lat.toFixed(5), f.lon.toFixed(5)].map(String))];
  const csv = () => descargarTexto(tabla().map((r) => r.map((x) => `"${x.replace(/"/g, '""')}"`).join(",")).join("\n"), nombreArchivo("inventario-sumideros", "csv"), "text/csv;charset=utf-8");
  const pdf = () => generarInformePDF({
    titulo: "Inventario de pozos sumideros",
    subtitulo: `${vista.length} sumideros${operador !== "todas" ? ` de ${operador}` : ""}. Inyección declarada ${periodo(iny?.desde, iny?.hasta)}: ${totalM3.toLocaleString("es-AR")} m³.`,
    secciones: [{ titulo: "Sumideros", tabla: { columnas: tabla()[0].slice(0, 9), filas: tabla().slice(1).map((r) => r.slice(0, 9)) } }],
    metodo: `Registro provincial: SIG Hidrocarburos, Subsecretaría de Energía de Neuquén (pozos con fluido SUM). Registro nacional e inyección: ${iny?.fuente ?? "Secretaría de Energía"}, descargado ${iny?.descargado ?? ""}. "Revisar" indica pozos declarados en inyección efectiva con 0 m³ en todo el período; puede haber explicaciones operativas (pozo nuevo sin arrancar, inyección declarada bajo otra sigla).`,
    archivo: nombreArchivo("inventario-sumideros", "pdf")
  });

  return (
    <div className="p-5 sm:p-8 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="titulo text-4xl sm:text-5xl font-semibold">Sumideros</h1>
          <p className="text-sm text-tenue mt-1 max-w-2xl">Registro provincial y nacional de pozos sumideros de Neuquén con el agua que cada operadora declara inyectar a la Secretaría de Energía{iny ? `, ${periodo(iny.desde, iny.hasta)}` : ""}.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <a href="#/instalaciones" className="flex items-center gap-1.5 px-2.5 py-1.5 border border-linea text-hielo hover:border-hielo"><MapPin className="w-3.5 h-3.5" /> Ver en el mapa</a>
          {puede("instalaciones.exportar") && <>
            <button onClick={pdf} className="flex items-center gap-1.5 px-2.5 py-1.5 border border-linea text-hielo hover:border-hielo"><FileDown className="w-3.5 h-3.5" /> PDF</button>
            <button onClick={csv} className="px-2.5 py-1.5 border border-linea text-hielo hover:border-hielo">CSV</button>
          </>}
        </div>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por coherencia">
        {(["todas", "activo_sin", "dejo", "inyecta", "otro", "inactivo", "sin_nacion"] as const).map((k) => (
          <button key={k} onClick={() => setFiltroCoh(k)} aria-pressed={filtroCoh === k}
            className={`flex items-center gap-2 px-2.5 py-1.5 text-xs border ${filtroCoh === k ? "border-hielo text-texto" : "border-linea text-tenue"}`}>
            {k !== "todas" && <span className="w-2.5 h-2.5 rounded-full" style={{ background: COHERENCIA[k].color }} />}
            {k === "todas" ? "Todos" : COHERENCIA[k].nombre}
            {k !== "todas" && <span className="num">{conteo(k)}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <label className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-tenue absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar sumidero, área u operadora" className="w-full bg-noche border border-linea pl-8 pr-3 py-2 text-sm" />
        </label>
        <select value={operador} onChange={(e) => setOperador(e.target.value)} className="bg-noche border border-linea text-sm px-2 py-2" aria-label="Operadora">
          <option value="todas">Todas las operadoras</option>
          {operadoras.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-tenue"><input type="checkbox" checked={verAbandonados} onChange={(e) => setVerAbandonados(e.target.checked)} /> Incluir abandonados</label>
      </div>

      <p className="text-xs text-tenue"><span className="num text-texto">{vista.length}</span> sumideros · <span className="num text-texto">{totalM3.toLocaleString("es-AR")}</span> m³ declarados en el período · tocá una fila para verla en el mapa</p>

      <div className="overflow-x-auto border border-linea bg-panel">
        <table className="w-full text-sm min-w-[860px]">
          <thead className="text-xs text-tenue border-b border-linea">
            <tr>
              {cols.map(([c, t, tipo]) => (
                <th key={c} className={`px-3 py-2 font-medium ${tipo ? "text-right" : "text-left"}`}>
                  <button onClick={() => setOrden((o) => ({ col: c, asc: o.col === c ? !o.asc : c !== "total" && c !== "porDia" }))} className="inline-flex items-center gap-1 hover:text-texto">
                    {t}{orden.col === c && (orden.asc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-linea">
            {vista.map((f) => (
              <tr key={f.clave} onClick={() => irMapa(f)} className="cursor-pointer hover:bg-noche/40">
                <td className="px-3 py-2"><span className="block">{f.nombre}</span>{f.origen === "Solo Nación" && <span className="text-[10px] text-agua">solo en registro nacional</span>}</td>
                <td className="px-3 py-2 text-tenue">{f.operador}</td>
                <td className="px-3 py-2 text-tenue">{f.area}</td>
                <td className="px-3 py-2 text-tenue">{f.estado}</td>
                <td className="px-3 py-2 text-right num">{f.total === null ? "—" : f.total.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2 text-right num">{f.porDia === null ? "—" : f.porDia.toLocaleString("es-AR")}</td>
                <td className="px-3 py-2">{f.ultimoMes ?? "—"}</td>
                <td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-xs"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COHERENCIA[f.coh].color }} />{COHERENCIA[f.coh].nombre}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
