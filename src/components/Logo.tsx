import React from "react";

/**
 * Marca del sistema: un planeta con estratos de lutita (Vaca Muerta), una
 * órbita que lo rodea y un satélite en naranja térmico.
 * `animado` dibuja los trazos al aparecer (respeta reducir movimiento).
 */
export function LogoMarca({ size = 40, animado = false, className = "" }: { size?: number; animado?: boolean; className?: string }) {
  const id = React.useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`${animado ? "logo-animado" : ""} ${className}`} aria-hidden="true">
      <defs>
        <clipPath id={`planeta-${id}`}>
          <circle cx="32" cy="33" r="13" />
        </clipPath>
        <radialGradient id={`brillo-${id}`} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#C9A46A" stopOpacity="0.35" />
          <stop offset="1" stopColor="#C9A46A" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* mitad trasera de la órbita, tenue */}
      <ellipse className="logo-orbita" cx="32" cy="33" rx="27" ry="9.5" fill="none" stroke="#8FE3F0" strokeOpacity="0.35" strokeWidth="1.6" transform="rotate(-22 32 33)" />
      {/* planeta con estratos */}
      <circle cx="32" cy="33" r="13" fill={`url(#brillo-${id})`} />
      <g clipPath={`url(#planeta-${id})`} stroke="#C9A46A" strokeLinecap="round">
        <path className="logo-estrato" d="M17 29 Q32 25 47 29" strokeWidth="1.6" strokeOpacity="0.55" fill="none" />
        <path className="logo-estrato" d="M17 34 Q32 30 47 34" strokeWidth="2.2" fill="none" />
        <path className="logo-estrato" d="M17 39 Q32 35 47 39" strokeWidth="1.6" strokeOpacity="0.55" fill="none" />
      </g>
      <circle className="logo-planeta" cx="32" cy="33" r="13" fill="none" stroke="#C9A46A" strokeWidth="2.4" />
      {/* mitad delantera de la órbita, pasa por delante del planeta */}
      <path className="logo-orbita" d="M6.97 43.11 A27 9.5 -22 0 0 57.03 22.89" fill="none" stroke="#8FE3F0" strokeWidth="2" strokeLinecap="round" />
      {/* satélite */}
      <g className="logo-satelite" transform="translate(48.9 19.6) rotate(45)">
        <rect x="-3.6" y="-3.6" width="7.2" height="7.2" fill="#FF8A3D" />
        <rect x="-3.6" y="-3.6" width="7.2" height="7.2" fill="none" stroke="#0A1628" strokeWidth="1" />
      </g>
    </svg>
  );
}

export function LogoCompleto({ compacto = false }: { compacto?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMarca size={compacto ? 32 : 44} />
      <span className="leading-none">
        <span className={`titulo block font-semibold text-texto ${compacto ? "text-xl" : "text-2xl"}`}>Vaca Muerta</span>
        <span className="block text-[11px] text-tenue mt-0.5">monitor ambiental satelital</span>
      </span>
    </span>
  );
}
