/** Turfly's mark: a slanted pitch in volt with its markings (halfway line, centre circle, goal boxes). */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 36 24" width={(size * 36) / 24} height={size} className={className} aria-hidden="true">
      <path d="M6 1h29l-5 22H1z" fill="#d7f74a" />
      <g fill="none" stroke="#0f1a13" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M20.5 1l-5 22" />
        <ellipse cx="18" cy="12" rx="4.4" ry="4.2" />
        <path d="M4.4 7.5h4.2l-1.9 9H2.5" />
        <path d="M33.5 7.5h-4.2l-1.9 9h4.2" />
      </g>
    </svg>
  );
}

/** The mark with the name, set like kit lettering. */
export function Logo({ name, size = 22, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-[23px] font-extrabold uppercase italic leading-none tracking-[-.01em] ${className}`}>
      <LogoMark size={size} />
      {name}
    </span>
  );
}
