import * as sat from "satellite.js";

export interface SateliteTle {
  id: string;
  nombre: string;
  instrumento: string;
  franja_km: number;
  rol: string;
  tle1?: string;
  tle2?: string;
  error?: string;
}

export interface SateliteVivo extends SateliteTle {
  satrec: sat.SatRec;
}

export interface Posicion {
  lat: number;
  lon: number;
  altKm: number;
  velKms: number;
}

/** Punto de referencia para calcular pasadas: Añelo, centro operativo de Vaca Muerta */
export const ANELO = { lat: -38.352, lon: -68.789, nombre: "Añelo" };

export function prepararSatelites(lista: SateliteTle[]): SateliteVivo[] {
  return lista
    .filter((s) => s.tle1 && s.tle2)
    .map((s) => ({ ...s, satrec: sat.twoline2satrec(s.tle1!, s.tle2!) }));
}

export function posicion(satrec: sat.SatRec, fecha: Date): Posicion | null {
  const pv = sat.propagate(satrec, fecha);
  if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
  const gmst = sat.gstime(fecha);
  const geo = sat.eciToGeodetic(pv.position as sat.EciVec3<number>, gmst);
  const v = pv.velocity as sat.EciVec3<number>;
  return {
    lat: sat.degreesLat(geo.latitude),
    lon: sat.degreesLong(geo.longitude),
    altKm: geo.height,
    velKms: v ? Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) : 0
  };
}

/** Traza en tierra entre dos instantes; se corta al cruzar el antimeridiano */
export function trazaTerrestre(satrec: sat.SatRec, desde: Date, minutos: number, pasoSeg = 30): [number, number][][] {
  const tramos: [number, number][][] = [[]];
  let anterior: number | null = null;
  for (let s = 0; s <= minutos * 60; s += pasoSeg) {
    const p = posicion(satrec, new Date(desde.getTime() + s * 1000));
    if (!p) continue;
    if (anterior !== null && Math.abs(p.lon - anterior) > 180) tramos.push([]);
    tramos[tramos.length - 1].push([p.lon, p.lat]);
    anterior = p.lon;
  }
  return tramos.filter((t) => t.length > 1);
}

/** Círculo geodésico (polígono) de radio en km alrededor de un punto */
export function circuloKm(lat: number, lon: number, radioKm: number, n = 64): [number, number][] {
  const R = 6371;
  const d = radioKm / R;
  const la = (lat * Math.PI) / 180;
  const lo = (lon * Math.PI) / 180;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const b = (i / n) * 2 * Math.PI;
    const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
    const lon2 = lo + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
    let lonDeg = (lon2 * 180) / Math.PI;
    lonDeg = ((lonDeg + 540) % 360) - 180;
    pts.push([lonDeg, (lat2 * 180) / Math.PI]);
  }
  return pts;
}

export function elevacionSobre(satrec: sat.SatRec, fecha: Date, lat = ANELO.lat, lon = ANELO.lon): number | null {
  const pv = sat.propagate(satrec, fecha);
  if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
  const gmst = sat.gstime(fecha);
  const ecf = sat.eciToEcf(pv.position as sat.EciVec3<number>, gmst);
  const obs = { latitude: sat.degreesToRadians(lat), longitude: sat.degreesToRadians(lon), height: 0.3 };
  const look = sat.ecfToLookAngles(obs, ecf);
  return (look.elevation * 180) / Math.PI;
}

/** Próxima pasada visible sobre Añelo (elevación > umbral) en las próximas 24 h */
export function proximaPasada(satrec: sat.SatRec, desde: Date, umbralDeg = 10): { inicio: Date; maxElev: number; enCurso: boolean } | null {
  const paso = 30 * 1000;
  let inicio: Date | null = null;
  let maxElev = -90;
  const elev0 = elevacionSobre(satrec, desde);
  const enCurso = elev0 !== null && elev0 > umbralDeg;
  for (let t = desde.getTime(); t < desde.getTime() + 24 * 3600 * 1000; t += paso) {
    const e = elevacionSobre(satrec, new Date(t));
    if (e === null) continue;
    if (e > umbralDeg) {
      if (!inicio) inicio = new Date(t);
      maxElev = Math.max(maxElev, e);
    } else if (inicio) {
      break;
    }
  }
  return inicio ? { inicio, maxElev, enCurso } : null;
}

export function fmtCuenta(ms: number): string {
  if (ms <= 0) return "ahora";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min ${String(ss).padStart(2, "0")} s`;
}
