import React, { Suspense, lazy, useEffect, useState } from "react";
import { Globe2, Orbit, Flame, Images, FlaskConical, Droplets, Factory, Users, LogIn, CircleUser } from "lucide-react";
import { motion } from "motion/react";
import { useTema } from "./lib/tema";
import { Sun, Moon } from "lucide-react";
import { LogoMarca } from "./components/Logo";
import { SesionCtx, useSesionRaiz } from "./lib/sesion";

const CentroMando = lazy(() => import("./screens/CentroMando"));
const Orbitas = lazy(() => import("./screens/Orbitas"));
const Imagenes = lazy(() => import("./screens/Imagenes"));
const SueloAgua = lazy(() => import("./screens/SueloAgua"));
const Instalaciones = lazy(() => import("./screens/Instalaciones"));
const TableroDemo = lazy(() => import("./screens/TableroDemo"));
const Ingresar = lazy(() => import("./screens/Ingresar"));
const Usuarios = lazy(() => import("./screens/Usuarios"));

class Resguardo extends React.Component<{ children: React.ReactNode; clave: string }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  componentDidCatch(e: Error) {
    if (/dynamically imported module|Importing a module script|module script|ChunkLoadError|Failed to fetch/i.test(e.message)) {
      (window as any).recargarPorVersionNueva?.();
    }
  }
  componentDidUpdate(prev: { clave: string }) { const self = this as any; if (prev.clave !== self.props.clave && self.state.error) self.setState({ error: null }); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 max-w-xl">
          <h1 className="titulo text-3xl font-semibold">Esta pantalla no pudo cargarse</h1>
          <p className="text-tenue mt-2">Error: {this.state.error}. Probá recargar la página o elegí otra pantalla.</p>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

type Ruta = "inicio" | "orbitas" | "instalaciones" | "focos" | "suelo" | "catalogo" | "demo" | "ingresar" | "usuarios";

const RUTAS: { id: Ruta; nombre: string; corto?: string; icono: React.ElementType }[] = [
  { id: "inicio", nombre: "Inicio", icono: Globe2 },
  { id: "orbitas", nombre: "Órbitas", icono: Orbit },
  { id: "instalaciones", nombre: "Instalaciones", corto: "Plantas", icono: Factory },
  { id: "focos", nombre: "Focos", icono: Flame },
  { id: "suelo", nombre: "Suelo y agua", corto: "Suelo", icono: Droplets },
  { id: "catalogo", nombre: "Imágenes", icono: Images },
  { id: "demo", nombre: "Demo", icono: FlaskConical }
];

const leerRuta = (): Ruta => {
  const h = window.location.hash.replace("#/", "").replace("#", "") as Ruta;
  return RUTAS.some((r) => r.id === h) || h === "ingresar" || h === "usuarios" ? h : "inicio";
};

function Cargando() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="flex flex-col items-center gap-3">
        <LogoMarca size={72} animado />
        <span className="text-xs text-tenue">Preparando la pantalla…</span>
      </div>
    </div>
  );
}

export default function App() {
  const [ruta, setRuta] = useState<Ruta>(leerRuta);
  const { tema, alternar } = useTema();
  const sesion = useSesionRaiz();
  const { puede, admin, perfil, cargando } = sesion;
  const visibles = RUTAS.filter((r) => puede(r.id));
  const extras = [
    ...(admin ? [{ id: "usuarios" as Ruta, nombre: "Usuarios", icono: Users }] : []),
    perfil ? { id: "ingresar" as Ruta, nombre: "Mi cuenta", corto: "Cuenta", icono: CircleUser } : { id: "ingresar" as Ruta, nombre: "Ingresar", icono: LogIn }
  ];
  const navMovil = [...visibles, ...extras];
  // Pantalla sin permiso: se pide ingresar (sin sesión) o se vuelve a Inicio
  const bloqueada = !cargando && RUTAS.some((r) => r.id === ruta) && !puede(ruta);

  useEffect(() => {
    const r = RUTAS.find((x) => x.id === ruta);
    document.title = ruta === "inicio" ? "Vaca Muerta · Monitor ambiental satelital" : `${r?.nombre} · Vaca Muerta monitor ambiental`;
  }, [ruta]);

  useEffect(() => {
    const h = () => setRuta(leerRuta());
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  const irA = (r: string) => {
    window.location.hash = `#/${r}`;
    window.scrollTo({ top: 0 });
  };

  return (
    <SesionCtx.Provider value={sesion}>
    <div className="sala min-h-screen lg:pl-[88px] pb-[68px] lg:pb-0">
      {/* Riel de navegación (escritorio) */}
      <nav aria-label="Pantallas" className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[88px] flex-col items-center gap-1 py-5 border-r border-linea bg-noche/95 z-50">
        <a href="#/inicio" className="mb-5 logo-hover" aria-label="Monitor ambiental Vaca Muerta, inicio"><LogoMarca size={44} /></a>
        {[...visibles, ...extras.slice(0, -1)].map((r) => {
          const activo = ruta === r.id;
          const I = r.icono;
          return (
            <a key={r.id} href={`#/${r.id}`} aria-current={activo ? "page" : undefined}
              className={`relative w-[72px] py-2.5 flex flex-col items-center gap-1 text-[11px] ${activo ? "text-hielo" : "text-tenue hover:text-texto"}`}>
              {activo && <motion.span layoutId="riel-activo" className="absolute left-[-8px] top-2 bottom-2 w-[3px] bg-hielo" transition={{ type: "spring", duration: 0.35, bounce: 0.15 }} />}
              <I className="w-5 h-5" strokeWidth={1.6} />
              {r.nombre}
            </a>
          );
        })}
        {(() => { const c = extras[extras.length - 1]; const I = c.icono; return (
          <a href="#/ingresar" aria-current={ruta === "ingresar" ? "page" : undefined} title={perfil?.email}
            className={`mt-auto w-[72px] py-2 flex flex-col items-center gap-1 text-[11px] ${ruta === "ingresar" ? "text-hielo" : "text-tenue hover:text-texto"}`}>
            <I className="w-5 h-5" strokeWidth={1.6} />{c.nombre}
          </a>); })()}
        <button onClick={alternar} className="mb-3 w-[72px] py-2 flex flex-col items-center gap-1 text-[11px] text-tenue hover:text-texto"
          aria-label={tema === "dia" ? "Cambiar a tema de noche (Lutita)" : "Cambiar a tema de día (Carta de campo)"}>
          {tema === "dia" ? <Moon className="w-5 h-5" strokeWidth={1.6} /> : <Sun className="w-5 h-5" strokeWidth={1.6} />}
          {tema === "dia" ? "Noche" : "Día"}
        </button>
        <a href="https://victorparedes.ar" target="_blank" rel="noopener" title="Desarrollado por Lic. Víctor Paredes"
          className=" text-[10px] text-tenue hover:text-lutita text-center leading-tight px-2">
          por<br />Lic. Víctor<br />Paredes
        </a>
      </nav>

      {/* Barra inferior (móvil) */}
      <nav aria-label="Pantallas" style={{ gridTemplateColumns: `repeat(${navMovil.length}, minmax(0, 1fr))` }} className="lg:hidden fixed bottom-0 inset-x-0 h-[64px] grid border-t border-linea bg-noche/95 backdrop-blur z-50 pb-[env(safe-area-inset-bottom)]">
        {navMovil.map((r: any) => {
          const activo = ruta === r.id;
          const I = r.icono;
          return (
            <a key={r.id} href={`#/${r.id}`} aria-current={activo ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 text-[10.5px] leading-none ${activo ? "text-hielo" : "text-tenue"}`}>
              {activo && <span className="absolute top-0 inset-x-3 h-[2px] bg-hielo" />}
              <I className="w-5 h-5" strokeWidth={1.6} />
              <span className="truncate max-w-full px-0.5">{r.corto ?? r.nombre}</span>
            </a>
          );
        })}
      </nav>

      {/* Barrido de telemetría al cambiar de pantalla */}
      <div key={`barrido-${ruta}`} className="barrido-ruta" aria-hidden="true" />
      <main>
        <Resguardo clave={ruta}>
        <Suspense fallback={<Cargando />}>
          <div key={ruta} className="entrada-pantalla">
          {bloqueada && (perfil
            ? <div className="p-8 max-w-xl"><h1 className="titulo text-3xl font-semibold">Sin acceso a esta pantalla</h1><p className="text-tenue mt-2">Tu usuario no tiene habilitada esta sección. Consultá con el administrador.</p></div>
            : <Ingresar alEntrar={() => setRuta(leerRuta())} />)}
          {!bloqueada && <>
          {ruta === "inicio" && <CentroMando irA={irA} />}
          {ruta === "orbitas" && <Orbitas />}
          {ruta === "instalaciones" && <Instalaciones />}
          {ruta === "focos" && <TableroDemo vista="venteos" />}
          {ruta === "suelo" && <SueloAgua />}
          {ruta === "catalogo" && <Imagenes />}
          {ruta === "demo" && <TableroDemo vista="general" />}
          {ruta === "ingresar" && <Ingresar alEntrar={() => irA("inicio")} />}
          {ruta === "usuarios" && <Usuarios />}
          </>}
          </div>
        </Suspense>
        </Resguardo>
      </main>
    </div>
    </SesionCtx.Provider>
  );
}
