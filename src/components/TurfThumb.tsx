/**
 * A turf's picture: its first photo, or (until the owner adds photos) a drawn pitch, so lists never show an empty box.
 * The drawing's shade of green varies per turf so neighbouring cards don't look identical.
 */
const SHADES = [
  ["#2f6a1f", "#295d1b"],
  ["#36751f", "#2f6a1f"],
  ["#24561c", "#1f4b19"],
  ["#3b6f24", "#33621f"],
  ["#1f4a22", "#1a401d"],
];

function shadeFor(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SHADES[h % SHADES.length];
}

export function TurfThumb({ photo, name, className = "", eager = false }: { photo?: string | null; name: string; className?: string; eager?: boolean }) {
  if (photo)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name} className={`h-full w-full object-cover ${className}`} loading={eager ? "eager" : "lazy"} />;
  const [a, b] = shadeFor(name);
  return (
    <svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" className={`h-full w-full ${className}`} role="img" aria-label={`${name} (no photo yet)`}>
      <rect width="160" height="100" fill={a} />
      {/* mowing stripes */}
      {Array.from({ length: 8 }, (_, i) => (i % 2 ? <rect key={i} x={i * 20} width="20" height="100" fill={b} /> : null))}
      <g fill="none" stroke="#f5f4ee" strokeOpacity="0.8" strokeWidth="1.6">
        <rect x="8" y="8" width="144" height="84" rx="1" />
        <line x1="80" y1="8" x2="80" y2="92" />
        <circle cx="80" cy="50" r="13" />
        <rect x="8" y="30" width="20" height="40" />
        <rect x="132" y="30" width="20" height="40" />
        <rect x="8" y="41" width="7" height="18" />
        <rect x="145" y="41" width="7" height="18" />
      </g>
      <circle cx="80" cy="50" r="1.8" fill="#f5f4ee" fillOpacity="0.9" />
      <circle cx="104" cy="62" r="5" fill="#d7f74a" stroke="#0f1a13" strokeOpacity="0.6" strokeWidth="0.8" />
    </svg>
  );
}
