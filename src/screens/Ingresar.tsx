import type React from "react";
import { useEffect, useState } from "react";
import { Loader2, LogIn, KeyRound, ShieldCheck } from "lucide-react";
import { supabase, gestionUsuarios, useSesion, ADMIN_EMAIL } from "../lib/sesion";

/** Ingreso con mail y contraseña. Si todavía no hay administrador, permite crear su cuenta una sola vez. */
export default function Ingresar({ alEntrar }: { alEntrar: () => void }) {
  const { sesion, perfil } = useSesion();
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [estado, setEstado] = useState<{ hay_admin: boolean } | null>(null);
  const [modoInicial, setModoInicial] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => { gestionUsuarios<{ hay_admin: boolean }>("estado").then(setEstado).catch(() => setEstado({ hay_admin: true })); }, []);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: clave });
    setOcupado(false);
    if (error) setError(/invalid/i.test(error.message) ? "Mail o contraseña incorrectos." : /banned/i.test(error.message) ? "Tu usuario está desactivado. Consultá con el administrador." : error.message);
    else alEntrar();
  };

  const crearAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (clave.length < 10) return setError("La contraseña debe tener al menos 10 caracteres.");
    if (clave !== clave2) return setError("Las contraseñas no coinciden.");
    setOcupado(true);
    try {
      await gestionUsuarios("inicial", { clave });
      const { error } = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password: clave });
      if (error) throw error;
      alEntrar();
    } catch (err: any) { setError(err.message); }
    finally { setOcupado(false); }
  };

  if (sesion && perfil) return <CambiarClave />;
  if (sesion && !perfil) {
    return (
      <Marco titulo="Cuenta sin perfil">
        <p className="text-sm text-tenue">Tu cuenta existe pero no tiene permisos asignados. Pedile al administrador que te dé de alta.</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-4 px-3 py-2 text-sm border border-linea">Salir</button>
      </Marco>
    );
  }

  if (modoInicial) {
    return (
      <Marco titulo="Configurar administrador">
        <p className="text-sm text-tenue">Se crea una sola vez la cuenta de administrador para <span className="text-texto">{ADMIN_EMAIL}</span>. Elegí una contraseña de al menos 10 caracteres.</p>
        <form onSubmit={crearAdmin} className="mt-4 space-y-3">
          <Campo etiqueta="Contraseña" tipo="password" valor={clave} cambiar={setClave} auto="new-password" />
          <Campo etiqueta="Repetir contraseña" tipo="password" valor={clave2} cambiar={setClave2} auto="new-password" />
          {error && <p className="text-sm text-llama">{error}</p>}
          <Boton ocupado={ocupado} icono={<ShieldCheck className="w-4 h-4" />}>Crear cuenta de administrador</Boton>
        </form>
      </Marco>
    );
  }

  return (
    <Marco titulo="Ingresar">
      <p className="text-sm text-tenue">El acceso al monitor es por invitación. Ingresá con el mail y la contraseña que te dio el administrador.</p>
      <form onSubmit={entrar} className="mt-4 space-y-3">
        <Campo etiqueta="Mail" tipo="email" valor={email} cambiar={setEmail} auto="email" />
        <Campo etiqueta="Contraseña" tipo="password" valor={clave} cambiar={setClave} auto="current-password" />
        {error && <p className="text-sm text-llama">{error}</p>}
        {aviso && <p className="text-sm text-tenue">{aviso}</p>}
        <Boton ocupado={ocupado} icono={<LogIn className="w-4 h-4" />}>Ingresar</Boton>
      </form>
      <button onClick={() => setAviso("Pedile al administrador que te asigne una contraseña nueva desde el panel de usuarios.")} className="mt-3 text-xs text-tenue underline underline-offset-2">Olvidé mi contraseña</button>
      {estado && !estado.hay_admin && (
        <button onClick={() => { setModoInicial(true); setError(null); setClave(""); }} className="mt-6 block text-xs text-hielo underline underline-offset-2">Primera vez: configurar la cuenta de administrador</button>
      )}
    </Marco>
  );
}

/** Cambio de la propia contraseña, una vez dentro */
function CambiarClave() {
  const { perfil, salir } = useSesion();
  const [clave, setClave] = useState("");
  const [clave2, setClave2] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const cambiar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (clave.length < 8) return setMsg({ ok: false, t: "Al menos 8 caracteres." });
    if (clave !== clave2) return setMsg({ ok: false, t: "Las contraseñas no coinciden." });
    setOcupado(true);
    const { error } = await supabase.auth.updateUser({ password: clave });
    setOcupado(false);
    setMsg(error ? { ok: false, t: error.message } : { ok: true, t: "Contraseña actualizada." });
    if (!error) { setClave(""); setClave2(""); }
  };
  return (
    <Marco titulo="Mi cuenta">
      <p className="text-sm"><span className="text-tenue">Ingresaste como</span> {perfil?.email}{perfil?.rol === "admin" ? " (administrador)" : ""}</p>
      <form onSubmit={cambiar} className="mt-5 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><KeyRound className="w-4 h-4 text-hielo" /> Cambiar contraseña</p>
        <Campo etiqueta="Nueva contraseña" tipo="password" valor={clave} cambiar={setClave} auto="new-password" />
        <Campo etiqueta="Repetir" tipo="password" valor={clave2} cambiar={setClave2} auto="new-password" />
        {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-llama"}`}>{msg.t}</p>}
        <Boton ocupado={ocupado}>Guardar contraseña</Boton>
      </form>
      <button onClick={salir} className="mt-6 px-3 py-2 text-sm border border-linea hover:border-linea-fuerte">Cerrar sesión</button>
    </Marco>
  );
}

export function Marco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center p-5">
      <div className="instrumento bg-panel w-full max-w-sm p-6 mt-10 sm:mt-0">
        <h1 className="titulo text-4xl font-semibold">{titulo}</h1>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
function Campo({ etiqueta, tipo, valor, cambiar, auto }: { etiqueta: string; tipo: string; valor: string; cambiar: (v: string) => void; auto: string }) {
  return (
    <label className="block">
      <span className="text-xs text-tenue">{etiqueta}</span>
      <input type={tipo} value={valor} onChange={(e) => cambiar(e.target.value)} autoComplete={auto} required
        className="mt-1 w-full bg-noche border border-linea px-3 py-2 text-sm focus:border-hielo outline-none" />
    </label>
  );
}
function Boton({ ocupado, icono, children }: { ocupado: boolean; icono?: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="submit" disabled={ocupado} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold bg-hielo text-noche disabled:opacity-60">
      {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : icono}{children}
    </button>
  );
}
