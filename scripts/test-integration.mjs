/**
 * Runs the database integration tests against a SEPARATE test database/schema, never the live data.
 *   npm run test:integration
 * Uses TEST_DATABASE_URL (from the environment or .env), e.g. the same database with ?schema=test.
 * Applies migrations to it first, then runs vitest with DATABASE_URL pointing at it.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env"); // does not override variables already set (e.g. in CI)
const testUrl = process.env.TEST_DATABASE_URL;
const liveUrl = process.env.DATABASE_URL;

const where = (u) => {
  try {
    const x = new URL(u);
    return `${x.host}${x.pathname} schema=${x.searchParams.get("schema") ?? "public"}`;
  } catch {
    return "?";
  }
};
if (!testUrl) {
  console.error('TEST_DATABASE_URL is not set. Add it to .env, e.g. the DATABASE_URL with "?schema=test" instead of "?schema=public".');
  process.exit(1);
}
if (liveUrl && where(testUrl) === where(liveUrl)) {
  console.error(`TEST_DATABASE_URL points at the same data as DATABASE_URL (${where(liveUrl)}). Refusing to run tests against live data.`);
  process.exit(1);
}

const env = { ...process.env, DATABASE_URL: testUrl, TURFLY_TEST_DB: "1" };
console.log(`Integration tests on ${where(testUrl)}`);
execSync("npx prisma migrate deploy", { stdio: "inherit", env });
execSync(`npx vitest run -c vitest.integration.config.ts ${process.argv.slice(2).join(" ")}`, { stdio: "inherit", env });
