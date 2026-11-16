/** Runs once when the server starts (Next.js instrumentation hook). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return; // builds (e.g. CI) don't carry production secrets
  const { checkEnv } = await import("./lib/env");
  const { errors, warnings } = checkEnv();
  for (const w of warnings) console.warn(`[env] WARNING: ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`[env] ERROR: ${e}`);
    if (process.env.NODE_ENV === "production" && process.env.SKIP_ENV_CHECK !== "true") {
      console.error("[env] Refusing to start in production with invalid configuration. Fix the errors above.");
      process.exit(1);
    }
  }
}
