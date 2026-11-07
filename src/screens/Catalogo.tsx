import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { RefreshCw } from "lucide-react";

interface Escena {
  id: string;
  platform: string;
  datetime: string | null;
  cloudCover: number | null;
  title: string;
  dataSize: string;
  thumbnailUrl: string | null;
}

export default function Catalogo() {
  const [datos, setDatos] = useState<any>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = () => {
    setCargando(true);
    fetch("/api/satellite-connection?lat=-38.25&lon=-68.95")
      .then((r) => r.json())
      .then(setDatos)
      .catch((e) => setDatos({ success: false, authErrorMsg: e.message, scenes: [] }))
      .finally(() => setCargando(false));
  };
  useEffect(cargar, []);

  const escenas: Escena[] = datos?.scenes || [];
  const s2 = escenas.filter((e) => e.platform.startsWith("Sentinel-2"));
  const s5 = escenas.filter((e) => e.platform.startsWith("Sentinel-5"));
  const ahora = Date.now();
  const VENTANA = 20 * 24 * 3600 * 1000;

  return (
    <div className="px-4 sm:px-8 py-8 max-w-6xl border-t border-linea">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="titulo text-3xl font-semibold">Pasadas recientes sobre la cuenca</h2>
          <p className="text-tenue mt-1 max-w-2xl">
            Escenas originales de Sentinel-2 y Sentinel-5P registradas en el catálogo Copernicus durante los últimos 20 días.
          </p>
        </div>
        <button onClick={cargar} disabled={cargando} className="flex items-center gap-1.5 px-3 py-2 text-sm border border-linea text-hielo hover:border-hielo disabled:opacity-60">
          <RefreshCw className={`w-4 h-4 ${cargando ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-3 text-sm">
        <Estado ok={datos?.authStatus === "authenticated"} texto={datos?.authStatus === "authenticated" ? "Conectado con tu cuenta Copernicus" : datos?.credentialsLoaded ? `Credenciales rechazadas: ${datos?.authErrorMsg ?? ""}` : "Catálogo público (sin credenciales)"} />
        {datos?.catalogoError && <Estado ok={false} texto={datos.catalogoError} />}
      </div>

      {/* Línea de tiempo de pasadas con nubosidad */}
      <section className="instrumento mt-6 p-5">
        <h3 className="titulo text-2xl font-semibold">Línea de tiempo de pasadas</h3>
        <p className="text-xs text-tenue">Cada barra es una pasada de Sentinel-2 (la altura indica nubosidad); los puntos ocres son pasadas de Sentinel-5P.</p>
        <svg viewBox="0 0 600 150" className="w-full mt-4" role="img" aria-label="Escenas Sentinel-2 por fecha y nubosidad">
          <line x1="20" x2="590" y1="120" y2="120" style={{ stroke: "var(--color-linea)" }} />
          {[0, 5, 10, 15, 20].map((d) => (
            <g key={d}>
              <line x1={590 - (d / 20) * 570} x2={590 - (d / 20) * 570} y1="120" y2="124" style={{ stroke: "var(--color-linea)" }} />
              <text x={590 - (d / 20) * 570} y="138" fontSize="10" textAnchor="middle" fontFamily="IBM Plex Mono" style={{ fill: "var(--color-tenue)" }}>{d === 0 ? "hoy" : `-${d} d`}</text>
            </g>
          ))}
          {s2.map((e, i) => {
            if (!e.datetime) return null;
            const x = 590 - ((ahora - new Date(e.datetime).getTime()) / VENTANA) * 570;
            const nub = e.cloudCover ?? 0;
            const h = Math.max(3, (nub / 100) * 100);
            return (
              <motion.rect key={e.id} x={x - 5} width={10} initial={{ y: 120, height: 0 }} animate={{ y: 120 - h, height: h }}
                transition={{ delay: i * 0.08, duration: 0.5 }} fill={nub < 20 ? "#8FE3F0" : "#5b7894"} />
            );
          })}
          {s5.map((e) => e.datetime && (
            <circle key={e.id} cx={590 - ((ahora - new Date(e.datetime).getTime()) / VENTANA) * 570} cy={112} r={4} style={{ fill: "var(--color-hielo)" }} />
          ))}
        </svg>
        
      </section>

      <section className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cargando && <p className="text-tenue">Consultando el catálogo…</p>}
        {!cargando && escenas.length === 0 && (
          <p className="text-tenue">No llegaron escenas. Revisá la conexión o volvé a intentar con Actualizar.</p>
        )}
        {escenas.slice(0, 9).map((e) => (
          <article key={e.id} className="instrumento overflow-hidden">
            <div className="aspect-[4/3] bg-noche">
              {e.thumbnailUrl ? (
                <img src={e.thumbnailUrl} alt={`Vista previa ${e.title}`} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer"
                  onError={(ev) => ((ev.currentTarget as HTMLImageElement).style.display = "none")} />
              ) : (
                <div className="w-full h-full grid place-items-center text-xs text-tenue">Sin vista previa</div>
              )}
            </div>
            <div className="p-4">
              <p className="font-medium">{e.platform}</p>
              <p className="text-xs text-tenue">{e.title}</p>
              <div className="flex justify-between mt-3 num text-xs">
                <span>{e.datetime ? new Date(e.datetime).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "-"}</span>
                <span className={e.cloudCover !== null && e.cloudCover < 20 ? "text-hielo" : "text-tenue"}>
                  {e.cloudCover !== null ? `${e.cloudCover.toFixed(0)}% nubes` : ""}
                </span>
              </div>
              <p className="num text-[10px] text-tenue mt-2 break-all">{e.id}</p>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function Estado({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 border ${ok ? "border-hielo/50 text-hielo" : "border-linea text-tenue"}`}>
      <span className={`w-2 h-2 rounded-full ${ok ? "bg-hielo" : "bg-tenue"}`} /> {texto}
    </span>
  );
}
