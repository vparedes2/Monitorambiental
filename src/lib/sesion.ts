/**
 * Usuarios y permisos del monitor (Supabase Auth + tabla perfiles).
 * El administrador da de alta cada usuario con su mail y elige con tildes qué pantallas
 * y funciones ve. El servidor vuelve a controlar los permisos en las consultas que gastan cupo.
 */
import { createClient, type Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState } from "react";

export const SUPABASE_URL = "https://azccpjhcafurltdndkam.supabase.co";
export const SUPABASE_CLAVE_PUBLICA = "sb_publishable_UFzi-mP-yeIThOiavE0n8Q_TEk0pRF9";
export const ADMIN_EMAIL = "vparedes2@gmail.com";
export const supabase = createClient(SUPABASE_URL, SUPABASE_CLAVE_PUBLICA, { auth: { persistSession: true, autoRefreshToken: true } });

export interface Permiso { id: string; nombre: string; detalle?: string }
export interface Seccion extends Permiso { ruta: string; fija?: boolean; subs: Permiso[] }

/** Catálogo de pantallas y funciones con tilde. Inicio se ve siempre (es la vitrina pública). */
export const SECCIONES: Seccion[] = [
  { id: "inicio", ruta: "inicio", nombre: "Inicio", fija: true, detalle: "Globo con los focos de las últimas 48 h. Lo ve cualquiera, incluso sin ingresar.", subs: [
    { id: "inicio.exportar", nombre: "Exportar focos (PDF, KML para Google Earth y CSV)" }
  ] },
  { id: "orbitas", ruta: "orbitas", nombre: "Órbitas", detalle: "Satélites en vivo y próximas pasadas.", subs: [] },
  { id: "instalaciones", ruta: "instalaciones", nombre: "Instalaciones", detalle: "Mapa del registro provincial con el cruce de focos térmicos.", subs: [
    { id: "instalaciones.venteos", nombre: "Venteos autorizados (capa y lista de permisos)" },
    { id: "instalaciones.sumideros", nombre: "Pozos sumideros de la capa provincial" },
    { id: "instalaciones.nacion", nombre: "Datos de Nación: sumideros no publicados e inyección declarada" },
    { id: "instalaciones.infra", nombre: "Ductos, áreas, locaciones, pozos y trazas" },
    { id: "instalaciones.exportar", nombre: "Exportar informe PDF y CSV del cruce" }
  ] },
  { id: "focos", ruta: "focos", nombre: "Focos", detalle: "Monitor de venteos con el catastro de instalaciones.", subs: [
    { id: "focos.kml", nombre: "Cargar catastro propio (KML o GeoJSON) y registrar instalaciones" },
    { id: "focos.ia", nombre: "Auditoría con IA de cada foco" }
  ] },
  { id: "suelo", ruta: "suelo", nombre: "Suelo y agua", detalle: "Análisis satelital de suelo, agua y derrames.", subs: [
    { id: "suelo.cambios", nombre: "Cambios de suelo y agua en un punto" },
    { id: "suelo.derrame_suelo", nombre: "Derrames en suelo" },
    { id: "suelo.derrame_agua", nombre: "Manchas en agua (radar)" },
    { id: "suelo.barridos", nombre: "Barridos de ríos y embalses" },
    { id: "suelo.lote", nombre: "Análisis por instalación (sumideros, instalaciones, KML)" },
    { id: "suelo.exportar", nombre: "Exportar informes PDF" }
  ] },
  { id: "catalogo", ruta: "catalogo", nombre: "Imágenes", detalle: "Imágenes satelitales de la cuenca por fecha y capa.", subs: [] },
  { id: "demo", ruta: "demo", nombre: "Demo", detalle: "Tablero de demostración con widgets de aire, agua y suelo.", subs: [
    { id: "demo.ia", nombre: "Análisis con IA (Gemini)" }
  ] }
];

export interface Perfil { id: string; email: string; nombre: string | null; rol: "admin" | "usuario"; activo: boolean; permisos: Record<string, boolean> }

let sesionActual: Session | null = null;

/** Todas las llamadas a /api del mismo sitio llevan el token de la sesión */
const fetchOriginal = window.fetch.bind(window);
window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  const propio = url.startsWith("/api/") || url.startsWith(`${location.origin}/api/`);
  if (propio && sesionActual?.access_token) {
    const headers = new Headers(init?.headers || (entrada instanceof Request ? entrada.headers : undefined));
    if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${sesionActual.access_token}`);
    return fetchOriginal(entrada, { ...init, headers });
  }
  return fetchOriginal(entrada, init);
};

/** Se usa una sola vez, en App; el resto de la interfaz lee el contexto con useSesion() */
export function useSesionRaiz() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    const cargarPerfil = async (s: Session | null) => {
      sesionActual = s;
      setSesion(s);
      if (!s) { setPerfil(null); setCargando(false); return; }
      const { data } = await supabase.from("perfiles").select("*").eq("id", s.user.id).maybeSingle();
      if (vivo) { setPerfil((data as Perfil) ?? null); setCargando(false); }
    };
    supabase.auth.getSession().then(({ data }) => cargarPerfil(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === "TOKEN_REFRESHED") { sesionActual = s; setSesion(s); return; }
      cargarPerfil(s);
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, []);

  const admin = perfil?.rol === "admin" && perfil.activo;
  /** ¿Puede ver esta pantalla o función? El admin ve todo; una función requiere también su pantalla. */
  const puede = (id: string) => {
    if (id === "inicio") return true;
    if (admin) return true;
    if (!perfil?.activo) return false;
    const pantalla = id.split(".")[0];
    if (pantalla !== "inicio" && !perfil.permisos[pantalla]) return false;
    return perfil.permisos[id] === true;
  };
  return { sesion, perfil, cargando, admin: !!admin, puede, salir: () => supabase.auth.signOut() };
}

/** Llamada a la función de Supabase que gestiona usuarios */
export async function gestionUsuarios<T = any>(accion: string, datos: Record<string, unknown> = {}): Promise<T> {
  const { data: s } = await supabase.auth.getSession();
  const r = await fetchOriginal(`${SUPABASE_URL}/functions/v1/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_CLAVE_PUBLICA, ...(s.session ? { Authorization: `Bearer ${s.session.access_token}` } : {}) },
    body: JSON.stringify({ accion, ...datos })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j as T;
}

export type EstadoSesion = ReturnType<typeof useSesionRaiz>;
export const SesionCtx = createContext<EstadoSesion>({ sesion: null, perfil: null, cargando: true, admin: false, puede: (id: string) => id === "inicio", salir: async () => ({ error: null }) } as unknown as EstadoSesion);
export const useSesion = () => useContext(SesionCtx);
