"""Generates docs/guide/architecture.html (print with Edge/Chrome to docs/Turfly-Architecture.pdf).

    python -I scripts/make-architecture-doc.py
Diagrams are plain SVG built by the helpers below so they stay editable and render offline.
"""
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "guide", "architecture.html")
E = html.escape

# ---------------------------------------------------------------- SVG helpers
STYLE = {
    "app": ("#ecfdf3", "#12b76a", "#05603a"),
    "inf": ("#f1f5f9", "#94a3b8", "#1e293b"),
    "ext": ("#fff7ed", "#f97316", "#9a3412"),
    "db": ("#f5f3ff", "#7c3aed", "#4c1d95"),
    "red": ("#fef2f2", "#ef4444", "#991b1b"),
    "white": ("#ffffff", "#cbd5e1", "#0f172a"),
}


def box(x, y, w, h, title, subs=(), cls="app", dashed=False, align="middle", title_size=12):
    fill, stroke, ink = STYLE[cls]
    dash = ' stroke-dasharray="5 4"' if dashed else ""
    out = [f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{fill}" stroke="{stroke}" stroke-width="1"{dash}/>']
    lines = [(title, True)] + [(s, False) for s in subs]
    n = len(lines)
    lh = 14
    cy = y + h / 2 - (n - 1) * lh / 2
    tx = x + w / 2 if align == "middle" else x + 10
    for i, (t, bold) in enumerate(lines):
        size = title_size if bold else 10.5
        weight = 600 if bold else 400
        color = ink if bold else "#475569"
        out.append(
            f'<text x="{tx}" y="{cy + i * lh}" text-anchor="{align if align == "middle" else "start"}" dominant-baseline="central" '
            f'font-size="{size}" font-weight="{weight}" fill="{color}">{E(t)}</text>'
        )
    return "\n".join(out)


def container(x, y, w, h, label, cls="inf"):
    _, stroke, ink = STYLE[cls]
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="none" stroke="{stroke}" stroke-width="1" stroke-dasharray="6 4"/>'
        f'<text x="{x + 12}" y="{y + 16}" font-size="11.5" font-weight="600" fill="{ink}">{E(label)}</text>'
    )


def arrow(points, dashed=False, color="#64748b", both=False):
    d = " ".join(f"{px},{py}" for px, py in points)
    dash = ' stroke-dasharray="5 4"' if dashed else ""
    start = ' marker-start="url(#ah)"' if both else ""
    return f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="1.3"{dash} marker-end="url(#ah)"{start}/>'


def label(x, y, t, anchor="middle", size=10, color="#475569", weight=400):
    return f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" fill="{color}">{E(t)}</text>'


def svg(h, body, w=720):
    return (
        f'<svg viewBox="0 0 {w} {h}" width="100%" class="dia" xmlns="http://www.w3.org/2000/svg">'
        '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>'
        + body
        + "</svg>"
    )


def sequence(lanes, msgs, row=30, w=720):
    """lanes: [(title, sub, cls)]; msgs: (from, to, text, kind) kind in call|ret|note|alt."""
    n = len(lanes)
    lw = 150
    xs = [round(w / n * (i + 0.5)) for i in range(n)]
    top = 52
    h = top + 22 + row * len(msgs) + 16
    out = []
    for i, (t, s, cls) in enumerate(lanes):
        out.append(box(xs[i] - lw / 2, 6, lw, 40, t, [s] if s else [], cls))
        out.append(f'<line x1="{xs[i]}" y1="46" x2="{xs[i]}" y2="{h - 6}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3"/>')
    y = top + 22
    step = 0
    for f, to, text, kind in msgs:
        if kind in ("note", "alt"):
            cls = "red" if kind == "alt" else "white"
            tw = max(150, len(text) * 5.6 + 20)
            if isinstance(to, int) and to != f:
                x0, x1 = min(xs[f], xs[to]) - 70, max(xs[f], xs[to]) + 70
                tw = x1 - x0
                cx = (x0 + x1) / 2
            else:
                cx = xs[f]
            x0 = max(4, min(w - 4 - tw, cx - tw / 2))
            fill, stroke, ink = STYLE[cls]
            out.append(f'<rect x="{x0}" y="{y - 11}" width="{tw}" height="22" rx="5" fill="{fill}" stroke="{stroke}"/>')
            out.append(label(x0 + tw / 2, y + 4, text, size=10, color=ink))
        else:
            step += 1
            x1, x2 = xs[f], xs[to]
            out.append(arrow([(x1, y + 4), (x2 + (-4 if x2 > x1 else 4), y + 4)], dashed=(kind == "ret"),
                             color="#94a3b8" if kind == "ret" else "#334155"))
            mid = (x1 + x2) / 2
            out.append(label(mid, y - 1, f"{step}. {text}", size=10, color="#0f172a" if kind == "call" else "#475569"))
        y += row
    return svg(h, "\n".join(out), w)


# ---------------------------------------------------------------- diagrams
def deployment_today():
    b = []
    b.append(box(20, 14, 200, 52, "Android app", ["Capacitor WebView, in.turfly.app"], "inf"))
    b.append(box(260, 14, 200, 52, "Mobile browser", ["PWA, service worker"], "inf"))
    b.append(box(500, 14, 200, 52, "Desktop browser", ["Players, owners, admin"], "inf"))
    for cx in (120, 360, 600):
        b.append(arrow([(cx, 66), (cx, 98)]))
    b.append(box(20, 100, 680, 52, "Cloudflare edge", ["TLS certificate, DDoS protection, quick tunnel host  *.trycloudflare.com  (random name per run)"], "inf"))
    b.append(container(20, 182, 460, 344, "Windows PC  (current host, must stay on)"))
    b.append(arrow([(340, 152), (340, 208)]))
    b.append(box(36, 210, 428, 50, "cloudflared.exe", ["Outbound QUIC connection to Cloudflare; forwards to http://localhost:3000"], "inf"))
    b.append(arrow([(240, 260), (240, 286)]))
    b.append(box(36, 288, 428, 132, "Next.js 15 production server  (npm start, port 3000)", [
        "35 server-rendered pages: player, owner, admin, legal",
        "35 API route handlers + server actions (owner, admin)",
        "next-auth JWT sessions, zod validation, CSP headers",
        "Booking engine, payments, notifications, chat, analytics",
        "instrumentation.ts checks env at start-up",
    ], "app"))
    b.append(box(36, 452, 190, 58, "cron-loop.mjs", ["POST /api/cron/tick", "every 60 s, Bearer secret"], "inf"))
    b.append(arrow([(131, 452), (131, 422)]))
    b.append(box(256, 452, 208, 58, "PostgreSQL 16 service", ["port 5432, 39 tables", "EXCLUDE gist constraint"], "db"))
    b.append(arrow([(360, 420), (360, 450)], both=True))
    ext = [
        ("Razorpay", "Orders, Checkout.js, refunds"),
        ("MSG91", "OTP + booking SMS (DLT)"),
        ("WhatsApp Cloud API", "Template reminders"),
        ("Resend", "Email receipts"),
        ("Firebase Cloud Messaging", "Push via HTTP v1"),
    ]
    ys = [182, 250, 318, 386, 454]
    for (t, s), y in zip(ext, ys):
        b.append(box(500, y, 200, 56, t, [s], "ext"))
        b.append(arrow([(488, y + 28), (498, y + 28)]))
    b.append(f'<polyline points="464,354 488,354" fill="none" stroke="#64748b" stroke-width="1.3"/>')
    b.append(f'<polyline points="488,210 488,482" fill="none" stroke="#64748b" stroke-width="1.3"/>')
    b.append(arrow([(600, 182), (600, 154)], dashed=True, color="#f97316"))
    b.append(label(606, 172, "webhooks in", anchor="start", color="#9a3412"))
    b.append(label(20, 548, "Green = Turfly code   Purple = data   Orange = third-party service   Grey = infrastructure", anchor="start", size=10))
    return svg(556, "\n".join(b))


def erd():
    b = []
    b.append(box(10, 20, 140, 48, "Turf", ["hours, pricing rules"], "app"))
    b.append(box(195, 20, 140, 48, "PitchConfig", ["Full 7s, Pitch A, Pitch B"], "app"))
    b.append(box(380, 20, 150, 48, "PitchConfigUnit", ["config uses unit"], "app"))
    b.append(box(570, 20, 140, 48, "ResourceUnit", ["Half A, Half B, lock"], "app"))
    b.append(arrow([(150, 44), (193, 44)])); b.append(label(171, 38, "1:n", size=9))
    b.append(arrow([(335, 44), (378, 44)])); b.append(label(356, 38, "1:n", size=9))
    b.append(arrow([(568, 44), (532, 44)])); b.append(label(550, 38, "1:n", size=9))
    b.append(box(10, 150, 140, 48, "User", ["role, phone, deletedAt"], "inf"))
    b.append(box(195, 150, 140, 48, "Booking", ["status, startAt, endAt"], "app"))
    b.append(box(570, 150, 140, 48, "Occupancy", ["unitId, tsrange, released"], "db"))
    b.append(arrow([(150, 174), (193, 174)])); b.append(label(171, 168, "1:n", size=9))
    b.append(arrow([(265, 68), (265, 148)])); b.append(label(271, 110, "booked config", anchor="start", size=9))
    b.append(arrow([(335, 174), (568, 174)])); b.append(label(450, 168, "1 row per unit used", size=9))
    b.append(arrow([(640, 68), (640, 148)])); b.append(label(646, 110, "locks unit", anchor="start", size=9))
    b.append(box(570, 270, 140, 48, "SlotBlock", ["maintenance, events"], "app"))
    b.append(arrow([(640, 270), (640, 200)]))
    b.append(box(195, 270, 140, 48, "Payment", ["paise, gateway ids"], "app"))
    b.append(box(10, 270, 140, 48, "Refund", ["auto or policy based"], "app"))
    b.append(box(380, 270, 150, 48, "LedgerEntry", ["advance, commission"], "app"))
    b.append(arrow([(265, 198), (265, 268)])); b.append(label(271, 236, "1:n", anchor="start", size=9))
    b.append(arrow([(193, 294), (152, 294)])); b.append(label(171, 288, "1:n", size=9))
    b.append(arrow([(320, 198), (320, 236), (455, 236), (455, 268)]))
    b.append(box(380, 340, 330, 44, "PostgreSQL rule on Occupancy", ["EXCLUDE (unitId =, tsrange(startAt, endAt) &&) WHERE NOT released"], "db"))
    b.append(box(10, 340, 325, 44, "WebhookEvent", ["unique gateway event id: each webhook applied once"], "app"))
    return svg(396, "\n".join(b))


def allocation():
    b = []
    # pitch drawing
    b.append('<rect x="20" y="20" width="250" height="150" rx="6" fill="#dcfce7" stroke="#16a34a"/>')
    b.append('<line x1="145" y1="20" x2="145" y2="170" stroke="#16a34a" stroke-dasharray="6 4"/>')
    b.append('<circle cx="145" cy="95" r="22" fill="none" stroke="#16a34a"/>')
    b.append(label(82, 99, "Half A", size=12, color="#14532d", weight=600))
    b.append(label(208, 99, "Half B", size=12, color="#14532d", weight=600))
    b.append(label(145, 190, "One physical pitch, two resource units", size=10))
    # timeline
    x0, x1 = 360, 700
    hours = ["5 PM", "6 PM", "7 PM", "8 PM", "9 PM", "10 PM"]
    step = (x1 - x0) / 5
    for i, hname in enumerate(hours):
        x = x0 + i * step
        b.append(f'<line x1="{x}" y1="30" x2="{x}" y2="150" stroke="#e2e8f0"/>')
        b.append(label(x, 24, hname, size=9.5))
    b.append(label(350, 74, "Half A", anchor="end", size=10.5, weight=600, color="#0f172a"))
    b.append(label(350, 124, "Half B", anchor="end", size=10.5, weight=600, color="#0f172a"))

    def bar(row, h0, h1, text, cls):
        fill, stroke, ink = STYLE[cls]
        y = 52 if row == 0 else 102
        xa, xb = x0 + h0 * step + 2, x0 + h1 * step - 2
        return (f'<rect x="{xa}" y="{y}" width="{xb - xa}" height="34" rx="5" fill="{fill}" stroke="{stroke}"/>'
                + label((xa + xb) / 2, y + 21, text, size=9.5, color=ink))
    b.append(bar(0, 1, 2, "Full 7s", "app")); b.append(bar(1, 1, 2, "Full 7s", "app"))
    b.append(bar(0, 2, 3, "Pitch A", "db"))
    b.append(bar(1, 3, 4, "Pitch B", "db"))
    b.append(bar(0, 4, 5, "Blocked", "inf")); b.append(bar(1, 4, 5, "Blocked", "inf"))
    b.append(label(530, 172, "Full 7s writes 2 occupancy rows; a 5s pitch writes 1", size=10))
    b.append(label(530, 188, "7 PM Full 7s is impossible: Half A is taken", size=10, color="#991b1b"))
    return svg(200, "\n".join(b))


def booking_states():
    b = []
    b.append(box(20, 110, 150, 48, "HELD", ["5-minute hold, rows locked"], "inf"))
    b.append(box(270, 110, 150, 48, "CONFIRMED", ["₹49 advance captured"], "app"))
    b.append(box(540, 30, 160, 48, "COMPLETED", ["cron, after end time"], "app"))
    b.append(box(540, 110, 160, 48, "CANCELLED", ["refund by policy tier"], "red"))
    b.append(box(540, 190, 160, 48, "NO_SHOW", ["marked by owner"], "red"))
    b.append(box(20, 236, 150, 48, "EXPIRED", ["cron: unpaid after 5 min"], "red"))
    b.append(box(270, 236, 150, 48, "Auto refund", ["late pay, slot taken"], "ext"))
    b.append(arrow([(170, 134), (268, 134)])); b.append(label(219, 127, "webhook", size=9.5))
    b.append(arrow([(420, 124), (480, 124), (480, 54), (538, 54)]))
    b.append(arrow([(420, 134), (538, 134)]))
    b.append(arrow([(420, 144), (480, 144), (480, 214), (538, 214)]))
    b.append(arrow([(95, 158), (95, 234)]))
    b.append(arrow([(170, 260), (268, 260)]))
    b.append(arrow([(150, 236), (150, 206), (330, 206), (330, 160)], dashed=True))
    b.append(label(240, 200, "late pay, slot still free", size=9.5))
    b.append(label(20, 24, "Walk-in and phone bookings by the owner start directly as CONFIRMED.", anchor="start", size=10))
    return svg(298, "\n".join(b))


def cron_pipeline():
    b = []
    b.append(box(20, 20, 160, 56, "cron-loop.mjs", ["every 60 s"], "inf"))
    b.append(arrow([(180, 48), (228, 48)]))
    b.append(box(230, 20, 220, 56, "POST /api/cron/tick", ["Authorization: Bearer CRON_SECRET"], "app"))
    steps = [
        ("1  releaseExpiredHolds()", "one atomic CTE: HELD > 5 min → EXPIRED, rows released"),
        ("2  completePastBookings()", "CONFIRMED and ended → COMPLETED"),
        ("3  recover stuck jobs", "SENDING for > 10 min → PENDING again"),
        ("4  processDueJobs(50)", "due NotificationJobs; failures retry after 1 min, 5 tries"),
    ]
    y = 100
    for t, s in steps:
        b.append(box(230, y, 470, 44, t, [s], "white", align="start"))
        y += 54
    b.append(arrow([(340, 76), (340, 98)]))
    # channels
    b.append(label(20, 116, "Jobs created on confirm:", anchor="start", size=10.5, weight=600, color="#0f172a"))
    for i, t in enumerate(["BOOKING_CONFIRMED  now", "REMINDER_24H  start - 24 h", "REMINDER_2H  start - 2 h", "BALANCE_PENDING  start - 3 h"]):
        b.append(label(20, 136 + i * 16, t, anchor="start", size=10))
    b.append(label(20, 214, "× each channel enabled in", anchor="start", size=10))
    b.append(label(20, 228, "admin settings", anchor="start", size=10))
    chans = [("In-app", "Notification row", "app"), ("Push", "FCM, if device token", "ext"), ("SMS", "MSG91", "ext"), ("WhatsApp", "Cloud API template", "ext"), ("Email", "Resend", "ext")]
    x = 20
    for t, s, c in chans:
        b.append(box(x, 340, 124, 48, t, [s], c))
        x += 137
    b.append(f'<polyline points="465,316 465,326 82,326 634,326" fill="none" stroke="#64748b" stroke-width="1.3"/>')
    for i in range(5):
        cx = 82 + i * 137
        b.append(arrow([(cx, 326), (cx, 338)]))
    b.append(label(360, 410, "Push is sent whenever an in-app notification is created (chat, booking, team events).", size=10))
    return svg(420, "\n".join(b))


def android():
    b = []
    b.append(container(20, 20, 430, 330, "Android phone", "inf"))
    b.append(container(36, 46, 398, 290, "Turfly app  in.turfly.app  (Capacitor 8, API 24 to 36)", "app"))
    b.append(box(52, 78, 366, 70, "WebView: loads server.url over HTTPS", ["User agent adds TurflyApp/1.0.0 (and push=1 with Firebase)", "Only Turfly + Razorpay pages open inside the app"], "white"))
    b.append(box(52, 160, 176, 72, "Capacitor plugins", ["App: back button", "PushNotifications: FCM token"], "app"))
    b.append(box(242, 160, 176, 72, "MainActivity.java", ["upi:// and intent:// to UPI apps", "DownloadManager + cookie"], "app"))
    b.append(box(52, 244, 176, 76, "www/offline.html", ["shown with no network", "retries the site"], "app"))
    b.append(box(242, 244, 176, 76, "NativeBridge.tsx", ["(web code) registers token", "POST /api/devices"], "app"))
    b.append(box(500, 40, 200, 56, "Turfly server", ["same site as browsers"], "app"))
    b.append(box(500, 160, 200, 56, "UPI apps", ["GPay, PhonePe, Paytm"], "ext"))
    b.append(box(500, 268, 200, 56, "Firebase Cloud Messaging", ["delivers push"], "ext"))
    b.append(arrow([(418, 104), (450, 104), (450, 68), (498, 68)], both=True))
    b.append(arrow([(418, 196), (498, 196)]))
    b.append(label(474, 190, "intent", size=9.5))
    b.append(arrow([(498, 296), (452, 296)]))
    b.append(label(474, 290, "push", size=9.5))
    return svg(362, "\n".join(b))


def target():
    b = []
    b.append(box(20, 14, 200, 48, "Android app", ["Play Store build"], "inf"))
    b.append(box(260, 14, 200, 48, "Browsers", ["turfly.in"], "inf"))
    b.append(box(500, 14, 200, 48, "Razorpay webhooks", ["fixed URL"], "ext"))
    for cx in (120, 360, 600):
        b.append(arrow([(cx, 62), (cx, 92)]))
    b.append(box(20, 94, 680, 48, "Cloudflare: DNS for your domain, WAF, rate limiting, named tunnel (permanent hostname)", [], "inf"))
    b.append(arrow([(360, 142), (360, 170)]))
    b.append(container(20, 172, 680, 214, "Server: cloud VM or small always-on machine  (docker-compose.prod.yml)", "inf"))
    b.append(box(40, 200, 200, 64, "app container", ["Next.js standalone build", "health check /api/health"], "app"))
    b.append(box(260, 200, 200, 64, "cron container", ["calls /api/cron/tick", "every minute"], "app"))
    b.append(box(480, 200, 200, 64, "cloudflared container", ["named tunnel token"], "inf"))
    b.append(box(40, 290, 420, 64, "PostgreSQL (managed: Neon, Supabase, RDS)", ["daily backups + point-in-time restore", "or the db container with nightly pg_dump off-site"], "db"))
    b.append(box(480, 290, 200, 64, "Monitoring", ["uptime ping, error tracking", "log retention"], "ext"))
    b.append(arrow([(140, 264), (140, 288)], both=True))
    b.append(arrow([(360, 264), (360, 288)], both=True))
    return svg(398, "\n".join(b))


DEPLOY = deployment_today()
ERD = erd()
ALLOC = allocation()
STATES = booking_states()
CRON = cron_pipeline()
ANDROID = android()
TARGET = target()

SEQ_LOGIN = sequence(
    [("Phone", "app or browser", "inf"), ("Next.js", "/api/auth/*", "app"), ("PostgreSQL", "OtpCode, User", "db"), ("MSG91", "SMS", "ext")],
    [
        (0, 1, "POST /api/auth/otp {phone}", "call"),
        (1, 2, "count sends: phone, IP, global", "call"),
        (1, 1, "limits: 5/h per phone, 30 s gap, 10/h per IP", "note"),
        (1, 2, "save HMAC(code), expires in 5 min", "call"),
        (1, 3, "send 6-digit code", "call"),
        (1, 1, "DEMO_MODE: code shown on screen (never for admins/owners)", "note"),
        (0, 1, "signIn('otp', phone, code)", "call"),
        (1, 2, "match hash, ≤ 5 tries, consume once", "call"),
        (1, 2, "upsert User (role PLAYER)", "call"),
        (1, 0, "httpOnly JWT session cookie", "ret"),
        (0, 1, "every page: pageUser() / requireUser(role)", "call"),
    ],
)

SEQ_BOOK = sequence(
    [("Player", "app / browser", "inf"), ("Next.js", "API + engine", "app"), ("PostgreSQL", "bookings", "db"), ("Razorpay", "gateway", "ext")],
    [
        (0, 1, "GET /api/turfs/:id/availability", "call"),
        (1, 2, "load occupancy, hours, pricing", "call"),
        (1, 0, "slot grid with prices", "ret"),
        (0, 1, "POST /api/bookings {config, date, hour}", "call"),
        (1, 2, "tx: Booking HELD + Occupancy rows", "call"),
        (2, 1, "EXCLUDE violation 23P01 → 'slot just taken'", "alt"),
        (1, 0, "booking id, holdExpiresAt", "ret"),
        (0, 1, "POST /api/payments/order", "call"),
        (1, 3, "create order (amount from DB, paise)", "call"),
        (3, 1, "order_id", "ret"),
        (0, 3, "Checkout.js: UPI / card / netbanking", "call"),
        (0, 1, "POST /api/payments/verify (signature saved)", "call"),
        (3, 1, "webhook payment.captured (HMAC-SHA256)", "call"),
        (1, 2, "dedupe event, HELD → CONFIRMED, ledger, jobs", "call"),
        (0, 1, "poll GET /api/bookings/:id", "call"),
        (1, 0, "CONFIRMED + receipt, calendar, share", "ret"),
    ],
)

SEQ_SPLIT = sequence(
    [("Organiser", "booking page", "inf"), ("Friend", "/split/<token>", "inf"), ("Next.js", "lib/split.ts", "app"), ("PostgreSQL", "SplitPlan, SplitShare", "db")],
    [
        (0, 2, "POST /api/bookings/:id/split {players}", "call"),
        (2, 3, "SplitPlan + N-1 OPEN shares", "call"),
        (0, 1, "share link on WhatsApp", "call"),
        (1, 2, "POST /api/split/:token/pay", "call"),
        (2, 3, "claim a free share for 10 min", "call"),
        (2, 2, "Razorpay order for the share amount", "note"),
        (2, 3, "webhook: share PAID, balance −, ledger +", "call"),
        (3, 2, "nothing free / closed → full refund", "alt"),
        (2, 0, "'Rahul paid their share (3 of 9)'", "ret"),
    ],
)

SEQ_CHAT = sequence(
    [("Player", "Messages page", "inf"), ("Next.js", "/api/conversations", "app"), ("PostgreSQL", "Conversation, Message", "db"), ("Owner", "Messages page", "inf")],
    [
        (0, 1, "POST /api/conversations {turfId}", "call"),
        (1, 2, "find or create (unique turf + player)", "call"),
        (0, 1, "POST …/messages {text ≤ 1000}", "call"),
        (1, 1, "participant check, 20 msgs/min limit", "note"),
        (1, 2, "insert Message, notify once per unread thread", "call"),
        (3, 1, "poll every 3 s (thread), 8 s (inbox)", "call"),
        (1, 3, "new messages; push if app installed", "ret"),
        (3, 1, "POST …/read", "call"),
    ],
)

LAYERS = """
<div class="layers">
  <div class="layer l-client"><b>Clients</b><span>Android app (Capacitor WebView)</span><span>Mobile / desktop browser</span><span>Service worker + offline page</span><span>Razorpay Checkout.js</span></div>
  <div class="layer l-page"><b>Pages (React Server Components, src/app)</b>
    <span>Player: / · /turfs · /turfs/[slug] · /compare · /checkout/[id] · /bookings · /split/[token] · /teams · /find-players · /messages · /notifications · /profile</span>
    <span>Owner: /owner · /owner/turfs · /owner/turfs/[id] · /owner/calendar · /owner/bookings · /owner/analytics</span>
    <span>Admin: /admin · /admin/turfs · /admin/users · /admin/finance · /admin/settings</span>
    <span>Public: /login · /legal/* · /contact · /claim/[token] · /join/team/[token] · /account/delete</span></div>
  <div class="layer l-comp"><b>Client components (src/components)</b>
    <span>BookingWidget</span><span>Checkout</span><span>ChatApp</span><span>TurfMap (Leaflet)</span><span>charts</span><span>RosterEditor</span><span>TeamEditor</span><span>LoginForm</span><span>NativeBridge</span><span>ActionForm</span><span>ImagePicker</span><span>CompareBar</span></div>
  <div class="layer l-entry"><b>Server entry points</b>
    <span>/api/auth (OTP, next-auth)</span><span>/api/bookings (+ cancel, dispute, roster, ics)</span><span>/api/payments (order, verify, webhook, mock)</span><span>/api/turfs/[id] (availability, quote)</span><span>/api/teams · /api/player-posts · /api/reviews</span><span>/api/conversations</span><span>/api/bookings/[id]/split · /api/split/[token] (+ pay)</span><span>/api/notifications · /api/devices</span><span>/api/account · /api/owner/analytics/export</span><span>/api/cron/tick · /api/health</span><span>Server actions: owner/actions.ts, admin/actions.ts</span></div>
  <div class="layer l-guard"><b>Guards (every request)</b>
    <span>middleware.ts: sign-in gate (access.ts)</span><span>auth.ts: pageUser · requireUser(role) · requireTurfAccess</span><span>zod schemas</span><span>errors.ts: AppError → JSON</span><span>http.ts: clientIp (rate limits)</span><span>next.config: CSP, HSTS, frame deny</span></div>
  <div class="layer l-domain"><b>Domain logic (src/lib)</b>
    <span><i>engine/</i> allocation · slots · pricing · policy · split · booking</span><span><i>payments/</i> razorpay · service · refunds</span><span><i>notifications/</i> providers · service</span><span>push</span><span>split</span><span>chat</span><span>analytics</span><span>teams</span><span>search</span><span>otp</span><span>account</span><span>owner · business · settings</span><span>time (IST) · format · share</span></div>
  <div class="layer l-data"><b>Data</b><span>db.ts: one Prisma client</span><span>PostgreSQL 16: 39 tables, 5 migrations</span><span>EXCLUDE + CHECK constraints</span><span>money in paise, times in UTC</span></div>
</div>
"""

FEATURES = [
    ("Platform", [
        ("Permanent domain + named tunnel or cloud host, nightly backups, uptime + error monitoring", "Must-have before real customers; the quick tunnel URL changes and a PC can go offline", "S", "Not built"),
        ("Real-time updates (Server-Sent Events) for chat and slot availability", "Removes 3 s polling, instant 'slot just taken' feedback", "M", "Polling"),
        ("End-to-end tests of the booking + payment flow (Playwright)", "Catches regressions in the money path before release", "M", "Unit + DB tests only"),
        ("SEO pages per area (\"football turf in Manjeri\") with structured data", "Free discovery from Google search", "S", "Sitemap only"),
        ("iPhone app from the same Capacitor project", "Reaches iOS users; needs a Mac and Apple account", "M", "Android only"),
    ]),
    ("Players", [
        ("Split payment: each player pays a share by UPI link", "Organiser no longer fronts the full cost; used by Playtomic", "M", "Built (Nov 2026)"),
        ("Slot alerts / waitlist: 'tell me if 7 PM frees up'", "Fills cancelled slots in minutes; a gap players ask for in other apps", "S", "Not built"),
        ("Recurring weekly bookings (same slot every Tuesday)", "Office groups and regular teams book once for the month", "M", "Not built"),
        ("Rain-out credit for the monsoon (June to September)", "Owner declares a washout → automatic credit or free reschedule; builds trust in Kerala", "S", "Not built"),
        ("Turfly wallet: refunds and referral rewards as instant credit", "No 5 to 7 day bank wait; brings players back", "M", "Ledger ready"),
        ("Open matches with skill level and per-seat payment", "Solo players join games; extends Find players", "M", "Find players built"),
        ("Malayalam interface", "Local language for owners, staff and many players", "M", "English only"),
        ("Match stats, player profiles, man-of-the-match vote, leaderboards", "Social reason to keep using the app after booking", "M", "Schema ready"),
        ("Tournaments with entry fees and fixtures", "Weekend leagues are a big turf revenue source", "L", "Schema ready"),
        ("Weather forecast on the booking page (Open-Meteo, free, no key)", "Players avoid rained-out evenings", "S", "Not built"),
        ("Favourites and one-tap 'book again'", "Most bookings repeat the same turf and hour", "S", "Not built"),
    ]),
    ("Owners", [
        ("Automatic settlement with Razorpay Route (linked accounts)", "Owners get paid without manual payouts; less admin work and risk", "M", "Ledger ready"),
        ("Hour packs and memberships (e.g. 10 hours at 10% off)", "Prepaid revenue, loyal regulars", "M", "Not built"),
        ("Staff logins (manager, cashier) with limited rights", "Owners stop sharing their own login with staff", "S", "Owner only"),
        ("Add-ons and counter sales: ball, bibs, water, coaching", "Extra revenue tracked in the same ledger", "M", "Not built"),
        ("Last-minute deals: auto-discount unsold slots 3 h before", "Turns empty hours into revenue", "S", "Offers exist"),
        ("Pricing insights from the utilisation heatmap", "Suggests peak / off-peak prices from real demand", "S", "Analytics built"),
        ("Customer list: regulars, last visit, win-back offers by WhatsApp", "Simple CRM for repeat business", "M", "Not built"),
        ("GST invoices (GSTIN, tax lines on receipts)", "Needed by registered businesses and corporate customers", "S", "Plain receipt"),
        ("Expenses (electricity, staff, maintenance) and a profit view", "Owners see profit, not just revenue", "S", "Not built"),
    ]),
]


def features_html():
    out = []
    for group, rows in FEATURES:
        out.append(f"<h3>{E(group)}</h3><table class='feat'><tr><th>Feature</th><th>Why it adds value</th><th>Effort</th><th>Today</th></tr>")
        for f, why, effort, today in rows:
            out.append(f"<tr><td>{E(f)}</td><td>{E(why)}</td><td class='c'><span class='chip e{effort}'>{effort}</span></td><td>{E(today)}</td></tr>")
        out.append("</table>")
    return "\n".join(out)


CSS = """
@page { size: A4; margin: 14mm 14mm 16mm; }
:root { --g7:#027a48; --g6:#039855; --g5:#12b76a; --g0:#ecfdf3; --ink:#0f172a; --mut:#475569; --line:#e2e8f0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Segoe UI", system-ui, sans-serif; color: var(--ink); font-size: 10pt; line-height: 1.5; margin: 0; }
h1 { font-size: 22pt; margin: 0 0 4mm; }
h2 { font-size: 14.5pt; margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid var(--g5); }
h3 { font-size: 11pt; margin: 4mm 0 1.5mm; color: var(--g7); }
p { margin: 0 0 2.5mm; } ul { margin: 0 0 3mm; padding-left: 5mm; } li { margin-bottom: .8mm; }
section { page-break-before: always; }
.avoid { page-break-inside: avoid; }
.dia { display: block; margin: 2mm 0 3mm; font-family: "Segoe UI", system-ui, sans-serif; }
.muted { color: var(--mut); } .small { font-size: 8.8pt; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9pt; }
th { text-align: left; background: #f1f5f9; padding: 1.5mm 2mm; border-bottom: 1px solid var(--line); font-weight: 600; }
td { padding: 1.5mm 2mm; border-bottom: 1px solid var(--line); vertical-align: top; }
tr { page-break-inside: avoid; }
td.c { text-align: center; white-space: nowrap; }
code { font-family: Consolas, monospace; font-size: 8.6pt; background: #f1f5f9; padding: .2mm 1mm; border-radius: 1mm; }
.note { border-left: 3px solid var(--g5); background: var(--g0); padding: 2.2mm 3.2mm; margin: 3mm 0; }
.warn { border-left: 3px solid #f59e0b; background: #fffbeb; padding: 2.2mm 3.2mm; margin: 3mm 0; }
.chip { display: inline-block; padding: .2mm 2mm; border-radius: 10mm; font-size: 8pt; font-weight: 700; }
.eS { background: #d1fadf; color: #05603a; } .eM { background: #fef3c7; color: #92400e; } .eL { background: #fee2e2; color: #991b1b; }
.cover { height: 262mm; display: flex; flex-direction: column; justify-content: space-between; background: #07130d; color: #fff; border-radius: 5mm; padding: 18mm 16mm; }
.cover h1 { font-size: 38pt; line-height: 1.05; margin: 8mm 0 5mm; }
.cover .tag { color: #a6f4c5; font-weight: 600; }
.cover .logo { font-size: 18pt; font-weight: 800; }
.cover .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; font-size: 9.5pt; color: #cbd5e1; }
.cover .meta b { display: block; color: #fff; font-size: 10.5pt; }
.toc { columns: 2; column-gap: 10mm; }
.toc div { break-inside: avoid; padding: 1.2mm 0; border-bottom: 1px dotted var(--line); }
.toc b { color: var(--g6); display: inline-block; width: 7mm; }
.layers { display: flex; flex-direction: column; gap: 2mm; margin: 2mm 0 4mm; }
.layer { border: 1px solid; border-radius: 2.5mm; padding: 2mm 2.5mm; display: flex; flex-wrap: wrap; gap: 1.2mm; font-size: 8.4pt; }
.layer b { width: 100%; font-size: 9.5pt; }
.layer span { background: #fff; border: 1px solid var(--line); border-radius: 1.5mm; padding: .4mm 1.6mm; }
.layer i { color: var(--g7); font-style: normal; font-weight: 600; }
.l-client { background: #f8fafc; border-color: #94a3b8; } .l-page, .l-comp { background: #ecfdf3; border-color: #12b76a; }
.l-entry { background: #f0fdf4; border-color: #16a34a; } .l-guard { background: #fef2f2; border-color: #ef4444; }
.l-domain { background: #ecfdf3; border-color: #039855; } .l-data { background: #f5f3ff; border-color: #7c3aed; }
.down { text-align: center; color: #94a3b8; font-size: 9pt; margin: -1.2mm 0; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; }
.card { border: 1px solid var(--line); border-radius: 2.5mm; padding: 2.5mm 3.5mm; font-size: 9pt; }
.card h3 { margin-top: 0; }
"""

SECTIONS = []


def section(title, body):
    SECTIONS.append((title, body))


section("System at a glance", f"""
<p>Turfly is <b>one Next.js application</b> backed by <b>one PostgreSQL database</b>. The same server renders every page, answers the
JSON API used by the pages and the Android app, receives Razorpay webhooks and runs the minute-by-minute background work.
Everything else (payments, SMS, WhatsApp, email, push) is a third-party service called over HTTPS.</p>
<table>
<tr><th>Layer</th><th>Technology</th><th>Where in the code</th></tr>
<tr><td>Web app</td><td>Next.js 15.5 (App Router), React 19, TypeScript, Tailwind CSS</td><td><code>src/app</code>, <code>src/components</code></td></tr>
<tr><td>Android app</td><td>Capacitor 8 WebView shell, Java <code>MainActivity</code></td><td><code>mobile/</code></td></tr>
<tr><td>Auth</td><td>next-auth 4 (JWT cookie), phone OTP, optional Google</td><td><code>src/lib/auth.ts</code>, <code>src/lib/otp.ts</code></td></tr>
<tr><td>Database</td><td>PostgreSQL 16 via Prisma 5 (39 tables, 5 migrations)</td><td><code>prisma/</code>, <code>src/lib/db.ts</code></td></tr>
<tr><td>Booking engine</td><td>Pure TypeScript rules + DB constraint for concurrency</td><td><code>src/lib/engine/</code></td></tr>
<tr><td>Payments</td><td>Razorpay Orders + Checkout.js + webhooks, refunds API</td><td><code>src/lib/payments/</code></td></tr>
<tr><td>Notifications</td><td>Job table + cron; in-app, FCM push, MSG91 SMS, WhatsApp Cloud API, Resend email</td><td><code>src/lib/notifications/</code>, <code>src/lib/push.ts</code></td></tr>
<tr><td>Maps</td><td>Leaflet + OpenStreetMap tiles; directions open Google Maps</td><td><code>TurfMap.tsx</code></td></tr>
<tr><td>Validation</td><td>zod 4 on every API body and server action</td><td>each route</td></tr>
<tr><td>Tests</td><td>Vitest: 38 unit tests, 27 database integration tests</td><td><code>tests/</code></td></tr>
<tr><td>Delivery</td><td>GitHub, Actions CI (type check, tests, build), Android APK workflow, Dockerfile</td><td><code>.github/workflows</code></td></tr>
</table>
<h3>Design rules the whole system follows</h3>
<ul>
<li><b>The database is the referee.</b> Double booking is made impossible by a PostgreSQL <code>EXCLUDE</code> constraint, not by application checks that two servers could both pass.</li>
<li><b>Only the payment gateway confirms a booking.</b> The browser's "payment succeeded" message is recorded but never trusted; the HMAC-signed webhook is.</li>
<li><b>Money is integers.</b> All amounts are stored in paise and computed on the server from database rows.</li>
<li><b>Time is UTC in the database, IST on screen.</b> India has no daylight saving, so IST is a fixed +05:30 offset.</li>
<li><b>Every protected page and API call checks the user itself</b> (role and ownership), not just the layout around it.</li>
</ul>
""")

section("Deployment today", f"""
<p>How a request travels from a phone to the code and back, as it runs right now on the Windows PC.</p>
{DEPLOY}
<table>
<tr><th>Process</th><th>Started by</th><th>Role</th></tr>
<tr><td>Next.js server</td><td><code>npm.cmd start</code></td><td>Pages, API, webhooks. Listens only on localhost:3000.</td></tr>
<tr><td>cloudflared</td><td><code>cloudflared tunnel --url http://localhost:3000</code></td><td>Opens an outbound connection to Cloudflare; no router ports are opened. A quick tunnel gets a <b>new random hostname each start</b>.</td></tr>
<tr><td>Cron loop</td><td><code>npm.cmd run cron:local</code></td><td>Calls <code>/api/cron/tick</code> every minute with the <code>CRON_SECRET</code>.</td></tr>
<tr><td>PostgreSQL 16</td><td>Windows service (automatic)</td><td>All data. User <code>turfly</code>, database <code>turfly</code>, port 5432, not exposed outside the PC.</td></tr>
</table>
<div class="warn">Limits of this setup: the site is down whenever the PC sleeps, restarts or loses internet; the URL changes when cloudflared restarts
(the Android app has the URL built in); there are no off-site backups. Section 14 shows the production layout that removes these limits.</div>
""")

section("Code layers", f"""
<p>Requests flow top to bottom. Each layer only calls the layer below it; domain rules live in <code>src/lib</code> so pages, API routes
and server actions share exactly the same logic.</p>
{LAYERS}
<div class="grid2">
<div class="card"><h3>Server components and server actions</h3>Pages run on the server, read the database directly through <code>src/lib</code> and send HTML.
Owner and admin forms post to server actions (<code>owner/actions.ts</code>, <code>admin/actions.ts</code>), which re-check the role and turf ownership
and write an <code>AuditLog</code> row for sensitive changes.</div>
<div class="card"><h3>API routes</h3>Interactive parts (slot picker, checkout, chat, teams) call JSON routes. Each one validates input with zod, calls
<code>requireUser()</code>, runs domain code and turns an <code>AppError</code> into a clean JSON error with the right status code.</div>
</div>
""")

section("Data model", f"""
<p>The core booking tables and how they connect. The convertible pitch is modelled with <b>resource units</b> (physical areas) and
<b>pitch configs</b> (what can be booked); a booking locks every unit its config uses.</p>
{ERD}
<table>
<tr><th>Area</th><th>Tables</th></tr>
<tr><td>Identity</td><td>User (PLAYER / OWNER / ADMIN), OtpCode, DeviceToken (push), AuditLog</td></tr>
<tr><td>Venues</td><td>City, Turf, OperatingHours, ResourceUnit, PitchConfig, PitchConfigUnit, PricingRule, TurfClaim, Review</td></tr>
<tr><td>Bookings</td><td>Booking (HELD, CONFIRMED, CANCELLED, EXPIRED, COMPLETED, NO_SHOW; source ONLINE, WALK_IN, PHONE), Occupancy, SlotBlock, Dispute</td></tr>
<tr><td>Money</td><td>Payment, Refund, WebhookEvent, LedgerEntry, Offer, PlatformSetting, SplitPlan, SplitShare</td></tr>
<tr><td>Community</td><td>Team, TeamMember, TeamEvent, MatchPlayer, MatchResult, PlayerPost, PlayerPostRequest</td></tr>
<tr><td>Messaging</td><td>Conversation, Message, Notification, NotificationJob</td></tr>
<tr><td>Planned (schema only)</td><td>Tournament, TournamentTeam, Fixture</td></tr>
</table>
""")

section("Convertible pitch: how double booking is prevented", f"""
{ALLOC}
<p>Each booking, hold or owner block writes one <code>Occupancy</code> row <b>per resource unit</b> it uses. PostgreSQL rejects any new row whose
unit is the same and whose time range overlaps a live row:</p>
<p><code>EXCLUDE USING gist ("unitId" WITH =, tsrange("startAt","endAt",'[)') WITH &amp;&amp;) WHERE (released = false)</code></p>
<ul>
<li>Ranges are half-open <code>[start, end)</code>, so 6 to 7 PM and 7 to 8 PM do not clash.</li>
<li>Two players pressing "Book" at the same instant: both transactions try to insert; one commits, the other gets error <code>23P01</code>
and sees "this slot was just taken". This holds even with several server instances.</li>
<li>Releasing a hold or cancelling sets <code>released = true</code>, which frees the units instantly without deleting history.</li>
<li>Owners can model other layouts (three 5s pitches merging into one 9s, a shared lock unit when halves can't run together) with the same tables.</li>
</ul>
<h3>Slots and prices</h3>
<p><code>slots.ts</code> builds a 1-hour grid from operating hours (late-night hours past midnight belong to the previous day), then prices each slot from the base rate
and <code>PricingRule</code> windows (peak evenings, weekends), prorated in 30-minute pieces when a slot crosses a boundary. <code>pricing.ts</code> splits the price into
the ₹49 online advance, optional platform fee, discount and balance payable at the venue.</p>
""")

section("Sign-in", f"""
<p>Phone OTP is the main sign-in; Google is optional when keys are configured.</p>
{SEQ_LOGIN}
<ul>
<li>Codes are stored only as an HMAC hash, expire in 5 minutes, allow 5 attempts and are consumed atomically (a code works once).</li>
<li>SMS abuse limits: per phone (5 per hour, 30 s between sends), per IP (10 per hour) and a global hourly cap (<code>OTP_GLOBAL_PER_HOUR</code>).</li>
<li>The session is a signed JWT in an httpOnly, secure cookie. Role changes take effect on the next request because <code>currentUser()</code> reloads the user from the database; suspended accounts are refused.</li>
</ul>
""")

section("Booking and payment", f"""
{SEQ_BOOK}
<ul>
<li><b>Holds:</b> a booking starts as HELD for 5 minutes with its occupancy rows already locked, so nobody can take the slot while the player pays.</li>
<li><b>Order:</b> the amount is calculated on the server from the database; an open order for the same booking is reused instead of creating another.</li>
<li><b>Webhook:</b> verified with HMAC-SHA256 over the raw body (constant-time compare), stored in <code>WebhookEvent</code> by gateway event id so retries are no-ops, amount checked against the order, then a conditional <code>UPDATE … WHERE status = 'HELD'</code> confirms.</li>
<li><b>On confirm:</b> ledger rows (advance collected, commission), notification jobs, in-app + push notification to player and owner.</li>
</ul>
""")

section("Booking lifecycle", f"""
{STATES}
<table>
<tr><th>Edge case</th><th>What happens</th></tr>
<tr><td>Payment arrives after the hold expired, slot still free</td><td>Units are re-acquired and the booking is confirmed.</td></tr>
<tr><td>Payment arrives after the hold expired, slot taken by someone else</td><td>Booking stays EXPIRED and the payment is refunded in full automatically.</td></tr>
<tr><td>Second payment captured for the same booking</td><td>That extra payment is refunded automatically.</td></tr>
<tr><td>Player cancels</td><td><code>policy.ts</code> tiers decide the refund (shown in plain words before paying); units released.</td></tr>
<tr><td>Owner cancels</td><td>Refund of the owner-cancel percentage in the turf's policy (100% by default); player notified.</td></tr>
<tr><td>Reschedule</td><td>Old units released and new ones locked in one transaction; if the new slot is taken the whole change rolls back.</td></tr>
<tr><td>Friends paid split shares, then the booking is cancelled</td><td>Every share is refunded in full; the organiser's advance follows the policy.</td></tr>
<tr><td>Dispute</td><td>Player raises it from the booking page; admin resolves it in the admin console.</td></tr>
</table>
""")

section("Split payments", f"""
{SEQ_SPLIT}
<ul>
<li><b>Maths:</b> the venue price after discount is split into equal whole-rupee shares. Friends pay theirs online; the organiser keeps the remainder,
which their ₹49 advance already counts towards. Friends are never asked for more than the balance due at the venue.</li>
<li><b>Last-share race:</b> a friend claims a share for 10 minutes while paying (<code>FOR UPDATE SKIP LOCKED</code>), so two people can't pay for the same one.
Claims expire, so an abandoned checkout frees the share again.</li>
<li><b>Webhook only:</b> a share is marked paid only by the verified Razorpay webhook. If it can no longer be paid (all taken, split stopped, booking cancelled,
balance settled at the venue) the payment is refunded in full automatically. One share per person is enforced by a unique index.</li>
<li><b>Money:</b> each paid share lowers <code>balanceDue</code>, raises <code>splitCollected</code> and writes a <code>SPLIT_COLLECTED</code> ledger row owed to the turf.
Owner dashboards and analytics count it as collected online.</li>
<li><b>Cancellation:</b> every paid share is refunded in full; the organiser's own advance follows the cancellation policy. The split can be changed or stopped only while nobody has paid.</li>
</ul>
""")

section("Background work and notifications", f"""
{CRON}
<ul>
<li>Jobs are rows in <code>NotificationJob</code> with a unique key per booking, template and channel, so scheduling twice never sends twice.</li>
<li>Cancelling a booking cancels its pending jobs. A failed send is retried a minute later, up to 5 attempts, then marked FAILED with the error saved.</li>
<li>In demo mode SMS, WhatsApp and email are logged instead of sent; in-app and push work normally.</li>
</ul>
""")

section("Chat and owner analytics", f"""
<h3>Player and owner chat</h3>
{SEQ_CHAT}
<p>Only the player and the turf's current owner can read a conversation (admins cannot). Owners can only start chats with players who booked their
turf. Names are shown, never phone numbers.</p>
<h3>Owner analytics</h3>
<p><code>analytics.ts</code> computes revenue, bookings, cancellations, lead time, repeat customers and utilisation for any date range, compared with the
previous period of the same length. Utilisation counts <b>area-hours</b>: a full 7s hour uses both halves (2 area-hours); owner-blocked time is excluded
from capacity. Charts are dependency-free SVG (<code>charts.tsx</code>) with accessible table views; CSV export is formula-injection safe.</p>
""")

section("Android app", f"""
{ANDROID}
<ul>
<li>The app shows the live website, so every website change reaches the app without a Play Store update. Only native code changes need a new build.</li>
<li>Payments: Razorpay's UPI buttons open <code>upi://</code> or <code>intent://</code> links, which <code>MainActivity</code> hands to the installed UPI app.</li>
<li>Downloads (CSV, calendar file, "download my data") go through Android's DownloadManager with the session cookie.</li>
<li>Push: with <code>google-services.json</code>, the app gets an FCM token; the website registers it at <code>/api/devices</code>; the server sends pushes with the FCM HTTP v1 API.</li>
<li>Build: <code>mobile/scripts/build.mjs</code> writes the server URL, syncs Capacitor, generates icons and runs Gradle → debug APK or signed release AAB.</li>
</ul>
""")

section("Security", """
<table>
<tr><th>Layer</th><th>Protection</th></tr>
<tr><td>Transport</td><td>HTTPS everywhere (Cloudflare), HSTS, app allows HTTPS only.</td></tr>
<tr><td>Browser</td><td>Content-Security-Policy (scripts only from self and Razorpay), X-Frame-Options DENY, strict referrer policy, Permissions-Policy.</td></tr>
<tr><td>Sign-in</td><td>Hashed single-use OTPs, attempt and send limits per phone, IP and globally; no on-screen OTP for admins or real owners.</td></tr>
<tr><td>Sign-in gate</td><td><code>middleware.ts</code>: every page, the home page included, needs a valid session except the sign-in, about, legal, contact and account-deletion pages; signed-out visitors return to the page they asked for after signing in (same-site paths only).</td></tr>
<tr><td>Authorisation</td><td><code>pageUser()</code> on every protected page; <code>requireUser(role)</code> and <code>requireTurfAccess()</code> on every API call and server action.</td></tr>
<tr><td>Input</td><td>zod validation; Prisma parameterised queries; message length and rate limits; CSV export escapes formulas.</td></tr>
<tr><td>Payments</td><td>Server-side amounts, HMAC-verified webhooks, idempotent event handling, mock gateway refused when real keys exist.</td></tr>
<tr><td>Privacy</td><td>Phone numbers hidden from teammates unless shared; chat closed to admins; account deletion and data export; Android backup excludes the session.</td></tr>
<tr><td>Operations</td><td>Start-up env check (<code>instrumentation.ts</code>), <code>/api/health</code>, audit log for owner/admin actions, secrets only in <code>.env</code> (git-ignored).</td></tr>
</table>
""")

section("Production layout (recommended next step)", f"""
{TARGET}
<ul>
<li><b>Domain + named tunnel:</b> a permanent hostname such as <code>turfly.in</code>; the Android app and Razorpay webhook URL never change again.</li>
<li><b>Always-on server:</b> a small cloud VM (or always-on mini PC) running <code>docker-compose.prod.yml</code>; restarts automatically.</li>
<li><b>Managed database with backups:</b> point-in-time recovery protects bookings and payments.</li>
<li><b>Monitoring:</b> uptime checks on <code>/api/health</code> and error tracking so failures are noticed before customers report them.</li>
<li>The code needs no changes for this move: only environment variables (<code>APP_URL</code>, <code>DATABASE_URL</code>, keys) differ.</li>
</ul>
""")

section("Value-add features (research)", f"""
<p>Compared with Indian booking apps (Playo, Hudle, KheloMore, Turf Town) and Playtomic, the player-side features most worth adding next are split payments,
slot alerts and recurring bookings. On the owner side the priorities are automatic settlement and memberships. Kerala-specific additions are
monsoon rain-out credits and a Malayalam interface. Effort: <span class="chip eS">S</span> days,
<span class="chip eM">M</span> 1 to 2 weeks, <span class="chip eL">L</span> 3+ weeks.</p>
{features_html()}
<div class="note"><b>Suggested order:</b> 1) permanent hosting, backups and monitoring; 2) Razorpay Route settlement; 3) slot alerts + last-minute deals;
4) rain-out credits and the wallet; 5) Malayalam. Split payments are built (section 9).</div>
<p class="small muted">Sources: Playtomic help centre (open matches, split payment, level requests); Playo, Hudle and KheloMore store listings; Turf Town
business model write-up (smarther.co); club-management software listings on Capterra India. Feature availability changes often; check before relying on it.</p>
""")


def build():
    toc = "\n".join(f"<div><b>{i}</b>{E(t)}</div>" for i, (t, _) in enumerate(SECTIONS, 1))
    body = "\n".join(f'<section><h2>{i} · {E(t)}</h2>\n{b}\n</section>' for i, (t, b) in enumerate(SECTIONS, 1))
    doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Turfly technical architecture</title>
<meta name="viewport" content="width=device-width, initial-scale=1"><style>{CSS}</style></head>
<body>
<div class="cover">
  <div class="logo">Turfly</div>
  <div><div class="tag">Technical architecture</div><h1>How Turfly is built<br>and how it runs</h1>
  <p style="color:#cbd5e1;max-width:140mm">Deployment, code layers, data model, booking engine, payments, background jobs, the Android app, security,
  the recommended production layout and researched features worth adding next.</p></div>
  <div class="meta"><div><b>Version</b>0.3 (demo + Android)</div><div><b>Stack</b>Next.js 15 · PostgreSQL 16 · Capacitor 8</div><div><b>Launch city</b>Manjeri, Kerala</div></div>
</div>
<section><h2>Contents</h2><div class="toc">{toc}</div>
<p class="small muted" style="margin-top:6mm">Generated by <code>scripts/make-architecture-doc.py</code>. Companion documents: <code>docs/ARCHITECTURE.md</code>,
<code>docs/PRODUCTION.md</code>, <code>docs/ANDROID.md</code> and the user guide <code>docs/Turfly-How-It-Works.pdf</code>.</p></section>
{body}
</body></html>"""
    with open(OUT, "w", encoding="utf8") as f:
        f.write(doc)
    print("wrote", OUT)


build()
