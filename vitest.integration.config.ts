import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests write to the database. They must run through `npm run test:integration`, which points
// DATABASE_URL at TEST_DATABASE_URL (a separate schema/database) so live data is never touched.
if (process.env.TURFLY_TEST_DB !== "1") {
  throw new Error("Run database tests with `npm run test:integration` (uses TEST_DATABASE_URL, never the live database).");
}

export default defineConfig({
  test: { include: ["tests/integration/**/*.int.test.ts"], testTimeout: 30000, fileParallelism: false },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
