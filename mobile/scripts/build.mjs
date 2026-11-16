/**
 * Builds the Turfly Android app.
 *   TURFLY_URL=https://turfly.in node scripts/build.mjs debug     → dist/turfly-<version>-debug.apk (install on a phone to test)
 *   TURFLY_URL=https://turfly.in node scripts/build.mjs release   → dist/turfly-<version>-release.aab (upload to Google Play)
 * TURFLY_URL is remembered in .turfly-url, so later builds can omit it.
 * Release builds need keystore.properties (see docs/ANDROID.md). Tools are auto-detected (JDK 21, Android SDK).
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] === "release" ? "release" : "debug";
const savedUrlFile = join(root, ".turfly-url");
const url = (process.env.TURFLY_URL || (existsSync(savedUrlFile) ? readFileSync(savedUrlFile, "utf8").trim() : "")).replace(/\/$/, "");
if (!/^https:\/\//.test(url)) {
  console.error("Set TURFLY_URL to the https address of the Turfly server, e.g. TURFLY_URL=https://turfly.in");
  process.exit(1);
}
writeFileSync(savedUrlFile, url + "\n");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

// 1. Offline page needs the site address and the icon
writeFileSync(join(root, "www", "config.js"), `window.TURFLY_URL = ${JSON.stringify(url + "/")};\n`);
copyFileSync(join(root, "..", "public", "icons", "icon-192.png"), join(root, "www", "icon.png"));

// 2. Tools: JDK 21 + Android SDK (standard install locations on Windows/macOS/Linux)
const env = { ...process.env, TURFLY_URL: url };
const firstExisting = (paths) => paths.find((p) => p && existsSync(p));
if (!env.JAVA_HOME || !existsSync(env.JAVA_HOME)) {
  const msJdk = "C:\\Program Files\\Microsoft";
  const jdk = existsSync(msJdk) ? readdirSync(msJdk).filter((d) => /^jdk-21/.test(d)).sort().pop() : null;
  if (jdk) env.JAVA_HOME = join(msJdk, jdk);
}
const sdk = firstExisting([env.ANDROID_HOME, env.ANDROID_SDK_ROOT, env.LOCALAPPDATA && join(env.LOCALAPPDATA, "Android", "Sdk"), join(process.env.HOME ?? "", "Android", "Sdk")]);
if (!sdk) {
  console.error("Android SDK not found. See docs/ANDROID.md (Install the build tools).");
  process.exit(1);
}
env.ANDROID_HOME = sdk;
writeFileSync(join(root, "android", "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "\\\\")}\n`);

const run = (cmd, cwd = root) => {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, env, stdio: "inherit" });
};

// 3. Copy web assets + config into the native project, then (re)generate icons
run("npx cap sync android");
run(`python -I "${join(root, "..", "scripts", "make-icons.py")}" "${join(root, "android", "app", "src", "main", "res")}"`);

// 4. Gradle build
// Prefer a Gradle unpacked into mobile/.gradle-dist (for networks where the wrapper's GitHub download fails),
// otherwise the Gradle wrapper. Full paths: some Windows setups don't run programs from the current folder.
const win = process.platform === "win32";
const localDist = join(root, ".gradle-dist");
const localGradle = existsSync(localDist)
  ? readdirSync(localDist).filter((d) => /^gradle-/.test(d)).sort().map((d) => join(localDist, d, "bin", win ? "gradle.bat" : "gradle")).find(existsSync)
  : undefined;
const gradlew = `"${localGradle ?? join(root, "android", win ? "gradlew.bat" : "gradlew")}"`;
if (mode === "release" && !existsSync(join(root, "keystore.properties"))) {
  console.error("Release builds need mobile/keystore.properties with your upload key. See docs/ANDROID.md (Signing).");
  process.exit(1);
}
run(`${gradlew} ${mode === "release" ? "bundleRelease" : "assembleDebug"} --no-daemon`, join(root, "android"));

// 5. Collect the output
mkdirSync(join(root, "dist"), { recursive: true });
const out =
  mode === "release"
    ? [join(root, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab"), join(root, "dist", `turfly-${version}-release.aab`)]
    : [join(root, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk"), join(root, "dist", `turfly-${version}-debug.apk`)];
copyFileSync(out[0], out[1]);
console.log(`\nBuilt ${out[1]}\nServer: ${url}`);
