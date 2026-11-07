import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Loader2, UserPlus, ChevronDown, Check, Minus } from "lucide-react";
import { SECCIONES, gestionUsuarios, useSesion, type Perfil } from "../lib/sesion";

type Usuario = Perfil & { creado: string; ultimo_ingreso: string | null };
type Permisos = Record<string, boolean>;

const todos = (): Permisos => Object.fromEntries(SECCIONES.flatMap((s) => [[s.id, true], ...s.subs.map((x) => [x.id, true])]));

/** Panel del administrador: alta de usuarios por mail y permisos con tildes por pantalla y función */
export default function Usuarios() {
  const { admin, perfil, cargando } = useSesion();
  const [lista, setLista] = useState<Usuario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargar = () => gestionUsuarios<{ usuarios: Usuario[] }>("listar").then((d) => setLista(d.usuarios)).catch((e) => setError(e.message));
  useEffect(() => { if (admin) cargar(); }, [admin]);

  if (cargando) return <div className="p-8 text-tenue flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>;
  if (!admin) return <div className="p-8 text-tenue">Solo el administrador puede ver esta pantalla.</div>;
  return (
    <div className="max-w-4xl mx-auto p-5 sm:p-8 space-y-6">
      <header>
        <h1 className="titulo text-4xl sm:text-5xl font-semibold">Usuarios</h1>
        <p className="text-sm text-tenue mt-1">Das de alta a cada usuario con su mail y una contraseña inicial, y elegís con tildes qué pantallas y funciones ve. Después puede cambiar su contraseña desde Mi cuenta.</p>
      </header>

      <Alta alCrear={cargar} />

      <section className="instrumento bg-panel">
        <h2 className="titulo text-2xl font-semibold p-4 border-b border-linea">Usuarios dados de alta {lista && <span className="num text-base text-tenue">{lista.length}</span>}</h2>
        {error && <p className="p-4 text-sm text-llama">{error}</p>}
        {!lista && !error && <p className="p-4 text-sm text-tenue flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</p>}
        <ul className="divide-y divide-linea">
          {lista?.map((u) => (
            <li key={u.id}>
              <button onClick={() => setAbierto(abierto === u.id ? null : u.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-noche/40" aria-expanded={abierto === u.id}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${u.activo ? "bg-ok" : "bg-linea-fuerte"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{u.nombre ? `${u.nombre} · ` : ""}{u.email}</span>
                  <span className="block text-xs text-tenue">
                    {u.rol === "admin" ? "Administrador, ve todo" : `${resumen(u.permisos)}${u.activo ? "" : " · desactivado"}`}
                    {" · "}{u.ultimo_ingreso ? `último ingreso ${u.ultimo_ingreso.slice(0, 10)}` : "nunca ingresó"}
                  </span>
                </span>
                {u.rol !== "admin" && <ChevronDown className={`w-4 h-4 text-tenue transition-transform ${abierto === u.id ? "rotate-180" : ""}`} />}
              </button>
              {abierto === u.id && u.rol !== "admin" && u.id !== perfil?.id && <Editar u={u} alCambiar={cargar} alBorrar={() => { setAbierto(null); cargar(); }} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const resumen = (p: Permisos) => {
  const vistas = SECCIONES.filter((s) => !s.fija && p[s.id]).map((s) => s.nombre);
  return vistas.length ? `Ve: ${vistas.join(", ")}` : "Solo Inicio";
};

function Alta({ alCrear }: { alCrear: () => void }) {
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState(() => claveAzar());
  const [permisos, setPermisos] = useState<Permisos>({});
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true); setMsg(null);
    try {
      await gestionUsuarios("crear", { email, nombre, clave, permisos });
      setMsg({ ok: true, t: `Usuario creado. Pasale su mail y la contraseña inicial: ${clave}` });
      setEmail(""); setNombre(""); setPermisos({}); setClave(claveAzar());
      alCrear();
    } catch (err: any) { setMsg({ ok: false, t: err.message }); }
    finally { setOcupado(false); }
  };
  return (
    <form onSubmit={crear} className="instrumento bg-panel p-4 space-y-4">
      <h2 className="titulo text-2xl font-semibold flex items-center gap-2"><UserPlus className="w-5 h-5 text-hielo" /> Alta de usuario</h2>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block"><span className="text-xs text-tenue">Mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full bg-noche border border-linea px-3 py-2 text-sm" /></label>
        <label className="block"><span className="text-xs text-tenue">Nombre (opcional)</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-1 w-full bg-noche border border-linea px-3 py-2 text-sm" /></label>
        <label className="block"><span className="text-xs text-tenue">Contraseña inicial</span>
          <input required minLength={8} value={clave} onChange={(e) => setClave(e.target.value)} className="mt-1 w-full bg-noche border border-linea px-3 py-2 text-sm num" /></label>
      </div>
      <ArbolPermisos valor={permisos} cambiar={setPermisos} />
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-llama"}`}>{msg.t}</p>}
      <button disabled={ocupado} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-hielo text-noche disabled:opacity-60">
        {ocupado && <Loader2 className="w-4 h-4 animate-spin" />} Dar de alta
      </button>
    </form>
  );
}

function Editar({ u, alCambiar, alBorrar }: { u: Usuario; alCambiar: () => void; alBorrar: () => void }) {
  const [permisos, setPermisos] = useState<Permisos>(u.permisos || {});
  const [nombre, setNombre] = useState(u.nombre || "");
  const [clave, setClave] = useState("");
  const [borrar, setBorrar] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const hacer = async (accion: string, datos: Record<string, unknown>, ok: string, fin?: () => void) => {
    setOcupado(accion); setMsg(null);
    try { await gestionUsuarios(accion, { id: u.id, ...datos }); setMsg({ ok: true, t: ok }); (fin || alCambiar)(); }
    catch (e: any) { setMsg({ ok: false, t: e.message }); }
    finally { setOcupado(null); }
  };
  const cambiado = JSON.stringify(permisos) !== JSON.stringify(u.permisos || {}) || nombre !== (u.nombre || "");
  return (
    <div className="px-4 pb-5 space-y-4 bg-noche/30">
      <label className="block max-w-xs pt-3"><span className="text-xs text-tenue">Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="mt-1 w-full bg-noche border border-linea px-3 py-2 text-sm" /></label>
      <ArbolPermisos valor={permisos} cambiar={setPermisos} />
      <div className="flex flex-wrap gap-2 text-sm">
        <button disabled={!cambiado || !!ocupado} onClick={() => hacer("actualizar", { permisos, nombre }, "Permisos guardados.")} className="px-3 py-2 font-semibold bg-hielo text-noche disabled:opacity-50">
          {ocupado === "actualizar" ? "Guardando…" : "Guardar permisos"}
        </button>
        <button disabled={!!ocupado} onClick={() => hacer("actualizar", { activo: !u.activo }, u.activo ? "Usuario desactivado." : "Usuario activado.")} className="px-3 py-2 border border-linea hover:border-linea-fuerte">
          {u.activo ? "Desactivar" : "Activar"}
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <label className="block"><span className="text-xs text-tenue">Nueva contraseña</span>
          <input value={clave} onChange={(e) => setClave(e.target.value)} placeholder="mínimo 8 caracteres" className="mt-1 w-56 bg-noche border border-linea px-3 py-2 num" /></label>
        <button disabled={clave.length < 8 || !!ocupado} onClick={() => hacer("clave", { clave }, `Contraseña cambiada a: ${clave}`, () => setClave(""))} className="px-3 py-2 border border-linea disabled:opacity-50">Asignar</button>
        <button onClick={() => setClave(claveAzar())} className="px-3 py-2 text-tenue hover:text-texto">Generar</button>
      </div>
      <div className="text-sm">
        {!borrar
          ? <button onClick={() => setBorrar(true)} className="text-llama underline underline-offset-2">Eliminar usuario</button>
          : <span className="flex flex-wrap items-center gap-2">¿Eliminar a {u.email}? No se puede deshacer.
              <button onClick={() => hacer("eliminar", {}, "Eliminado.", alBorrar)} className="px-3 py-1.5 bg-llama text-noche font-semibold">Sí, eliminar</button>
              <button onClick={() => setBorrar(false)} className="px-3 py-1.5 border border-linea">Cancelar</button></span>}
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-llama"}`}>{msg.t}</p>}
    </div>
  );
}

/** Árbol de tildes: cada pantalla con sus funciones. Marcar una pantalla marca todas sus funciones;
 *  marcar una función marca su pantalla. */
export function ArbolPermisos({ valor, cambiar }: { valor: Permisos; cambiar: (p: Permisos) => void }) {
  const pon = (cambios: Permisos) => cambiar({ ...valor, ...cambios });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Qué puede ver</p>
        <div className="flex gap-3 text-xs">
          <button type="button" onClick={() => cambiar(todos())} className="text-hielo underline underline-offset-2">Marcar todo</button>
          <button type="button" onClick={() => cambiar({})} className="text-tenue underline underline-offset-2">Desmarcar todo</button>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {SECCIONES.map((s) => {
          const subsOn = s.subs.filter((x) => valor[x.id]).length;
          const on = s.fija || !!valor[s.id];
          const parcial = on && s.subs.length > 0 && subsOn > 0 && subsOn < s.subs.length;
          return (
            <fieldset key={s.id} className="border border-linea p-3">
              <Tilde marcado={on} parcial={parcial} deshabilitado={s.fija}
                cambiar={(v) => pon({ [s.id]: v, ...Object.fromEntries(s.subs.map((x) => [x.id, v])) })}
                texto={<span className="font-medium">{s.nombre}{s.fija ? " (siempre visible)" : ""}</span>} />
              {s.detalle && <p className="text-[11px] text-tenue ml-7 mt-0.5">{s.detalle}</p>}
              {s.subs.length > 0 && (
                <div className={`ml-7 mt-2 space-y-1.5 ${on ? "" : "opacity-50"}`}>
                  {s.subs.map((x) => (
                    <div key={x.id}><Tilde marcado={!!valor[x.id]} cambiar={(v) => pon({ [x.id]: v, ...(v && !s.fija ? { [s.id]: true } : {}) })} texto={<span className="text-xs">{x.nombre}</span>} /></div>
                  ))}
                </div>
              )}
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}

function Tilde({ marcado, parcial, deshabilitado, cambiar, texto }: { marcado: boolean; parcial?: boolean; deshabilitado?: boolean; cambiar: (v: boolean) => void; texto: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!parcial; }, [parcial]);
  return (
    <label className={`flex items-start gap-2.5 ${deshabilitado ? "cursor-default" : "cursor-pointer"}`}>
      <span className="relative mt-0.5 shrink-0">
        <input ref={ref} type="checkbox" checked={marcado} disabled={deshabilitado} onChange={(e) => cambiar(e.target.checked)} className="peer sr-only" />
        <span className={`w-[18px] h-[18px] border flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-hielo ${marcado ? "bg-hielo border-hielo text-noche" : "border-linea-fuerte"}`}>
          {marcado && (parcial ? <Minus className="w-3 h-3" strokeWidth={3} /> : <Check className="w-3 h-3" strokeWidth={3} />)}
        </span>
      </span>
      {texto}
    </label>
  );
}

const claveAzar = () => {
  const abc = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(10); crypto.getRandomValues(a);
  return Array.from(a, (n) => abc[n % abc.length]).join("");
};
