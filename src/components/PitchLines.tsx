/** Faint chalk markings (halfway line, centre circle, penalty box) behind a dark band, cropped off its right edge. */
export function PitchLines({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 400" preserveAspectRatio="xMaxYMid slice" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true">
      <g fill="none" stroke="#f5f4ee" strokeOpacity=".07" strokeWidth="3">
        <path d="M430 -10v420" />
        <circle cx="430" cy="200" r="92" />
        <path d="M600 70h-110v260h110" />
        <path d="M490 150a60 60 0 0 0 0 100" />
      </g>
      <circle cx="430" cy="200" r="5" fill="#f5f4ee" fillOpacity=".1" />
    </svg>
  );
}
