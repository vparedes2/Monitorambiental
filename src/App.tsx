import React, { Suspense, lazy, useEffect, useState } from "react";
import { Globe2, Orbit, Flame, Images, FlaskConical, Droplets, Factory } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { LogoMarca } from "./components/Logo";

const CentroMando = lazy(() => import("./screens/CentroMando"));
const Orbitas = lazy(() => import("./screens/Orbitas"));
const Imagenes = lazy(() => import("./screens/Imagenes"));
const SueloAgua = lazy(() => import("./screens/SueloAgua"));
const Instalaciones = lazy(() => import("./screens/Instalaciones"));
const TableroDemo = lazy(() => import("./screens/TableroDemo"));

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

type Ruta = "inicio" | "orbitas" | "instalaciones" | "focos" | "suelo" | "catalogo" | "demo";

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
  return RUTAS.some((r) => r.id === h) ? h : "inicio";
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
    <div className="sala min-h-screen lg:pl-[88px] pb-[68px] lg:pb-0">
      {/* Riel de navegación (escritorio) */}
      <nav aria-label="Pantallas" className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[88px] flex-col items-center gap-1 py-5 border-r border-linea bg-noche/95 z-50">
        <a href="#/inicio" className="mb-5 logo-hover" aria-label="Monitor ambiental Vaca Muerta, inicio"><LogoMarca size={44} /></a>
        {RUTAS.map((r) => {
          const activo = ruta === r.id;
          const I = r.icono;
          return (
            <a key={r.id} href={`#/${r.id}`} aria-current={activo ? "page" : undefined}
              className={`relative w-[72px] py-2.5 flex flex-col items-center gap-1 text-[11px] ${activo ? "text-hielo" : "text-tenue hover:text-texto"}`}>
              {activo && <motion.span layoutId="riel-activo" className="absolute left-[-8px] top-2 bottom-2 w-[3px] bg-hielo shadow-[0_0_12px_#8FE3F0]" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
              <I className="w-5 h-5" strokeWidth={1.6} />
              {r.nombre}
            </a>
          );
        })}
        <a href="https://victorparedes.ar" target="_blank" rel="noopener" title="Desarrollado por Lic. Víctor Paredes"
          className="mt-auto text-[10px] text-tenue hover:text-lutita text-center leading-tight px-2">
          por<br />Lic. Víctor<br />Paredes
        </a>
      </nav>

      {/* Barra inferior (móvil) */}
      <nav aria-label="Pantallas" className="lg:hidden fixed bottom-0 inset-x-0 h-[64px] grid grid-cols-6 border-t border-linea bg-noche/95 backdrop-blur z-50">
        {RUTAS.map((r) => {
          const activo = ruta === r.id;
          const I = r.icono;
          return (
            <a key={r.id} href={`#/${r.id}`} aria-current={activo ? "page" : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${activo ? "text-hielo" : "text-tenue"}`}>
              <I className="w-5 h-5" strokeWidth={1.6} />
              {r.corto ?? r.nombre}
            </a>
          );
        })}
      </nav>

      <main>
        <Resguardo clave={ruta}>
        <Suspense fallback={<Cargando />}>
          <AnimatePresence mode="wait">
          <motion.div key={ruta} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
          {ruta === "inicio" && <CentroMando irA={irA} />}
          {ruta === "orbitas" && <Orbitas />}
          {ruta === "instalaciones" && <Instalaciones />}
          {ruta === "focos" && <TableroDemo vista="venteos" />}
          {ruta === "suelo" && <SueloAgua />}
          {ruta === "catalogo" && <Imagenes />}
          {ruta === "demo" && <TableroDemo vista="general" />}
          </motion.div>
          </AnimatePresence>
        </Suspense>
        </Resguardo>
      </main>
    </div>
  );
}
