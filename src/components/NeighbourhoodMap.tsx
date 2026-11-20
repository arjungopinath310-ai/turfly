/**
 * Turfly's own illustration: a neighbourhood map at night with players and turfs nearby. Three moods for the welcome
 * screens and sign-in: players chatting about a game, turfs with free slots, and a turf owner's day.
 * Pure SVG + CSS (no images), so it is light, sharp on every screen and works offline in the app.
 */
type Variant = "players" | "turfs" | "owner";

const AVATARS = [
  { x: 60, y: 70, c: "#d7f74a", t: "AR", say: "Need 2 for 7s tonight?", side: "r" },
  { x: 300, y: 110, c: "#ff8a3d", t: "SN", say: "I'm in!", side: "l" },
  { x: 55, y: 255, c: "#7cc6ff", t: "FK", say: "8 PM works", side: "r" },
  { x: 300, y: 215, c: "#f5f4ee", t: "MJ", say: "Who's free Sunday?", side: "l" },
] as const;

const PINS = [
  { x: 110, y: 150, label: "Free 7 PM" },
  { x: 250, y: 130, label: "₹1,200/hr" },
  { x: 190, y: 235, label: "Free now" },
] as const;

function Bubble({ x, y, text, side, delay }: { x: number; y: number; text: string; side: "l" | "r"; delay: number }) {
  const w = Math.max(64, text.length * 6.2 + 20);
  const bx = side === "r" ? x + 22 : x - 22 - w;
  return (
    <g className="tf-pop" style={{ animationDelay: `${delay}ms` }}>
      <rect x={bx} y={y - 34} width={w} height={26} rx={4} fill="#f5f4ee" />
      <text x={bx + w / 2} y={y - 17} textAnchor="middle" fontSize="12" fontWeight="600" fill="#0f1a13">{text}</text>
    </g>
  );
}

function Pitch({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x={-22} y={-14} width={44} height={28} rx={1} fill="#458323" stroke="#f5f4ee" strokeWidth={2} />
      <line x1={0} y1={-14} x2={0} y2={14} stroke="#fff" strokeWidth={1.5} />
      <circle r={6} fill="none" stroke="#fff" strokeWidth={1.5} />
      <rect x={-22} y={-6} width={6} height={12} fill="none" stroke="#fff" strokeWidth={1.2} />
      <rect x={16} y={-6} width={6} height={12} fill="none" stroke="#fff" strokeWidth={1.2} />
    </g>
  );
}

export function NeighbourhoodMap({ variant = "players", className = "", crop = false }: { variant?: Variant; className?: string; crop?: boolean }) {
  return (
    <svg viewBox="0 0 360 300" preserveAspectRatio={crop ? "xMidYMid slice" : "xMidYMid meet"} className={className} role="img" aria-label={variant === "players" ? "Players nearby planning a game" : variant === "turfs" ? "Turfs nearby with free slots" : "A turf owner's bookings"}>
      {/* the map */}
      <rect width="360" height="300" fill="#16251b" />
      <path d="M-10 250 C 60 220, 90 280, 170 255 S 300 210, 380 240 L380 310 L-10 310 Z" fill="#173540" />
      <ellipse cx="300" cy="40" rx="55" ry="30" fill="#1f3a25" />
      <ellipse cx="40" cy="40" rx="40" ry="26" fill="#1f3a25" />
      <rect x="175" y="230" width="80" height="50" rx="3" fill="#1f3a25" />
      {[
        "M0 120 H360", "M0 178 C 120 170, 240 190, 360 176", "M70 0 V300", "M165 0 C 160 100, 175 200, 168 300", "M268 0 V300", "M0 60 C 100 70, 260 50, 360 64",
      ].map((d) => (
        <g key={d}>
          <path d={d} stroke="#0f1a13" strokeWidth={12} fill="none" />
          <path d={d} stroke="#2a3f31" strokeWidth={8} fill="none" />
        </g>
      ))}
      <Pitch x={215} y={255} s={0.9} />

      {variant === "players" && (
        <>
          {AVATARS.map((a, i) => (
            <g key={a.t}>
              <circle cx={a.x} cy={a.y} r={20} fill="#0f1a13" />
              <circle cx={a.x} cy={a.y} r={17} fill={a.c} />
              <text x={a.x} y={a.y + 4.5} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f1a13">{a.t}</text>
              <Bubble x={a.x} y={a.y} text={a.say} side={a.side} delay={300 + i * 450} />
            </g>
          ))}
          {/* you, in the middle */}
          <circle cx="180" cy="150" r="30" fill="#d7f74a" opacity="0.15" className="tf-pulse" />
          <circle cx="180" cy="150" r="22" fill="#0f1a13" />
          <circle cx="180" cy="150" r="19" fill="#d7f74a" />
          <text x="180" y="155" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0f1a13">You</text>
        </>
      )}

      {variant === "turfs" &&
        PINS.map((p, i) => (
          <g key={p.label}>
            <path d={`M${p.x} ${p.y} c -14 -16 -14 -38 0 -38 c 14 0 14 22 0 38 z`} fill="#d7f74a" stroke="#0f1a13" strokeWidth={2.5} />
            <circle cx={p.x} cy={p.y - 25} r={6} fill="#0f1a13" />
            <g className="tf-pop" style={{ animationDelay: `${300 + i * 400}ms` }}>
              <rect x={p.x - 38} y={p.y + 6} width={76} height={22} rx={3} fill="#f5f4ee" />
              <text x={p.x} y={p.y + 21} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#0f1a13">{p.label}</text>
            </g>
          </g>
        ))}

      {variant === "owner" && (
        <>
          <g transform="translate(40 40)">
            <rect width="170" height="150" rx="4" fill="#f5f4ee" />
            <text x="14" y="24" fontSize="12" fontWeight="800" fill="#0f1a13">TODAY</text>
            {[
              ["6 PM", "#458323", "Booked online"],
              ["7 PM", "#ff8a3d", "Walk-in"],
              ["8 PM", "#dbd8cb", "Free"],
              ["9 PM", "#504f45", "Blocked"],
            ].map(([t, c, l], i) => (
              <g key={t} transform={`translate(14 ${40 + i * 26})`}>
                <text y="13" fontSize="10.5" fill="#6a685b">{t}</text>
                <rect x="38" width="104" height="18" rx="2" fill={c} />
                <text x="46" y="13" fontSize="10" fontWeight="600" fill={c === "#dbd8cb" || c === "#ff8a3d" ? "#0f1a13" : "#fff"}>{l}</text>
              </g>
            ))}
          </g>
          <g className="tf-pop" style={{ animationDelay: "500ms" }}>
            <rect x="170" y="182" width="170" height="54" rx="4" fill="#d7f74a" stroke="#0f1a13" strokeWidth={1.5} />
            <circle cx="190" cy="209" r="11" fill="#0f1a13" />
            <path d="M184 209 l4 4 l8 -8" stroke="#d7f74a" strokeWidth={2.2} fill="none" />
            <text x="208" y="204" fontSize="11.5" fontWeight="800" fill="#0f1a13">New booking</text>
            <text x="208" y="220" fontSize="10.5" fill="#0f1a13">Sat 8 PM · 7-a-side</text>
          </g>
        </>
      )}
    </svg>
  );
}
