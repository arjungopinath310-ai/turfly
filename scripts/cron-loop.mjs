// Calls /api/cron/tick every minute: expires abandoned slot holds, marks finished matches as completed
// (unlocks reviews) and sends due reminders. Use when self-hosting without an external scheduler.
//   npm run cron:local        (reads CRON_SECRET from .env)
const url = process.env.CRON_URL ?? "http://localhost:3000/api/cron/tick";
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET is not set in .env");
  process.exit(1);
}

async function tick() {
  try {
    const res = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
    const body = await res.json().catch(() => ({}));
    console.log(new Date().toLocaleTimeString("en-IN"), res.status, JSON.stringify(body));
  } catch (e) {
    console.log(new Date().toLocaleTimeString("en-IN"), "server not reachable:", e.message);
  }
}

tick();
setInterval(tick, 60_000);
