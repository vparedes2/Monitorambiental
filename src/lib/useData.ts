import { useEffect, useState } from "react";
import type { SateliteTle } from "./orbits";

export interface FocoFirms {
  id: string;
  lat: number;
  lon: number;
  frp: number;
  fecha: string;
  sensor: string;
  match: boolean;
  instalacion?: string;
  estado: string;
}

export interface EstadoFirms {
  estado: "ok" | "sin_clave" | "error";
  mensaje: string;
  consultado_utc: string | null;
  total: number;
  por_fuente: Record<string, number | string>;
}

export function useFirms() {
  const [focos, setFocos] = useState<FocoFirms[]>([]);
  const [estado, setEstado] = useState<EstadoFirms | null>(null);
  const [catastro, setCatastro] = useState(0);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    fetch("/api/venteos/monitoreo-satelital-en-vivo")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        setEstado(d.estado_firms || null);
        setCatastro(d.total_instalaciones_catastro || 0);
        setFocos(
          (d.cruces_espaciales || []).map((c: any) => ({
            id: c.id,
            lat: c.deteccion_satelital.latitud_satelital,
            lon: c.deteccion_satelital.longitud_satelital,
            frp: c.deteccion_satelital.frp_mw,
            fecha: c.deteccion_satelital.fecha_hora_utc,
            sensor: c.deteccion_satelital.sensor,
            match: c.match_catastral,
            instalacion: c.instalacion_sig?.nombre_oficial,
            estado: c.estado_regulatorio
          }))
        );
      })
      .catch(() => vivo && setEstado({ estado: "error", mensaje: "No se pudo conectar con el servidor.", consultado_utc: null, total: 0, por_fuente: {} }))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, []);

  return { focos, estado, catastro, cargando };
}

export function useTle() {
  const [satelites, setSatelites] = useState<SateliteTle[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/orbitas/tle")
      .then((r) => r.json())
      .then((d) => setSatelites(d.satelites || []))
      .catch((e) => setError(e.message));
  }, []);
  return { satelites, error };
}

/** Convierte "2026-11-05 04:29 UTC" a Date */
export function parseFechaFirms(f: string): Date | null {
  const m = f.match(/(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})/);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:00Z`) : null;
}

export function usePrefiereMenosMovimiento() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, []);
  return reduce;
}
