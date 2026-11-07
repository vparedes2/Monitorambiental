import { useEffect, useState } from "react";

/** Tema de la consola: "dia" (Carta de campo), "noche" (Lutita) o "auto" (según el sistema). */
export type PreferenciaTema = "auto" | "dia" | "noche";
const CLAVE = "tema-monitor";
const COLOR_BARRA = { dia: "#F1ECE2", noche: "#12100E" } as const;

const sistemaClaro = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches;

export function leerPreferencia(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CLAVE);
    if (v === "dia" || v === "noche" || v === "auto") return v;
  } catch { /* sin almacenamiento */ }
  return "auto";
}

export function aplicarTema(pref: PreferenciaTema) {
  const tema = pref === "auto" ? (sistemaClaro() ? "dia" : "noche") : pref;
  document.documentElement.dataset.tema = tema;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", COLOR_BARRA[tema]);
  return tema;
}

export function useTema() {
  const [pref, setPref] = useState<PreferenciaTema>(leerPreferencia);
  const [tema, setTema] = useState<"dia" | "noche">(() => (document.documentElement.dataset.tema as "dia" | "noche") || "noche");

  // Varias partes de la interfaz pueden cambiar el tema: se sincronizan con un evento
  useEffect(() => {
    const h = (e: Event) => setPref((e as CustomEvent).detail as PreferenciaTema);
    window.addEventListener("tema-monitor", h);
    return () => window.removeEventListener("tema-monitor", h);
  }, []);

  useEffect(() => {
    setTema(aplicarTema(pref));
    try { localStorage.setItem(CLAVE, pref); } catch { /* */ }
    if (pref !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const h = () => setTema(aplicarTema("auto"));
    mq.addEventListener?.("change", h);
    return () => mq.removeEventListener?.("change", h);
  }, [pref]);

  /** Alterna entre día y noche (una elección manual deja de seguir al sistema) */
  const elegir = (p: PreferenciaTema) => window.dispatchEvent(new CustomEvent("tema-monitor", { detail: p }));
  const alternar = () => elegir(tema === "dia" ? "noche" : "dia");
  return { pref, tema, setPref: elegir, alternar };
}
