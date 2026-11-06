import { access, readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const publicRoot = resolve(projectRoot, process.env.FIREBASE_CONFIG_MODE === "emulator" ? "build/emulator-hosting" : "dist-hosting");

const requiredFiles = [
  "index.html",
  "404.html",
  "manifest.json",
  "sw.js",
  "style.css",
  "liquid-glass.css",
  "dist/app.js",
  "dist/firebase.js",
  "dist/auth.js",
  "dist/vendor/chart.js",
  "dist/vendor/jspdf.js",
  "dist/vendor/licenses/chart.js.txt",
  "dist/vendor/licenses/jspdf.txt",
  "dist/profile-feed.json",
  "dist/app/vendor/thatopen-bim-visual-panel.bundle.js",
  "dist/app/vendor/web-ifc.wasm",
  "dist/app/vendor/ifc-model.bundle.js",
  "dist/shared/i18n/index.js",
  "dist/infrastructure/api/client.js",
  "dist/app/vendor/ifc-lite_bg.wasm",
  "fonts/Roboto-Regular.ttf",
  "icons/icon-192.png",
  "icons/icon-512.png"
];

const forbiddenPathSegments = new Set([
  "node_modules",
  "scripts",
  "server",
  "src",
  "tests",
  "functions"
]);

const forbiddenFilePatterns = [
  /\.env(?:$|\.)/u,
  /\.map$/u,
  /\.ts$/u,
  /(?:^|[/\\])package(?:-lock)?\.json$/u,
  /(?:^|[/\\])tsconfig(?:\.[^/\\]+)?\.json$/u,
  /(?:^|[/\\])(?:README|SECURITY|CONTRIBUTING)(?:\.[^/\\]+)?\.md$/iu
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(entryPath));
      continue;
    }
    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

const files = await walk(publicRoot);
const missingFiles = [];

for (const file of requiredFiles) {
  try {
    await access(resolve(publicRoot, file));
  } catch {
    missingFiles.push(file);
  }
}

if (missingFiles.length > 0) {
  const formatted = missingFiles.map((file) => `- ${file}`).join("\n");
  throw new Error(`Required files missing from Firebase Hosting output:\n${formatted}`);
}

const violations = files.filter((filePath) => {
  const relativePath = relative(publicRoot, filePath);
  const segments = relativePath.split(sep);
  return segments.some((segment) => forbiddenPathSegments.has(segment)) ||
    forbiddenFilePatterns.some((pattern) => pattern.test(relativePath));
});

if (violations.length > 0) {
  const formatted = violations
    .map((filePath) => `- ${relative(publicRoot, filePath)}`)
    .join("\n");
  throw new Error(`Forbidden files found in Firebase Hosting output:\n${formatted}`);
}

if (process.argv.includes("--production")) {
  if (["test", "emulator"].includes(process.env.FIREBASE_CONFIG_MODE)) {
    throw new Error("Firebase Hosting requires a real Firebase web configuration.");
  }
  const source = await readFile(resolve(publicRoot, "dist/firebase.js"), "utf8");
  const config = source.match(/const firebaseConfig = \{([\s\S]*?)\};/u)?.[1] || "";
  const values = {};
  for (const field of ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"]) {
    const literal = config.match(new RegExp(`\\b${field}\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`))?.[1];
    const value = literal ? JSON.parse(literal) : "";
    if (!value.trim() || /^(?:demo(?:-|\.)|__|your[-_]|replace[-_])/iu.test(value)) {
      throw new Error(`Firebase Hosting configuration is missing or contains a placeholder: ${field}.`);
    }
    values[field] = value;
  }
  const aliases = JSON.parse(await readFile(resolve(projectRoot, ".firebaserc"), "utf8"));
  // Firebase CLI supplies GCLOUD_PROJECT to predeploy hooks for explicit --project targets.
  const targetProject = process.env.GCLOUD_PROJECT || aliases.projects.default;
  if (!targetProject || values.projectId !== targetProject) {
    throw new Error("Firebase Hosting configuration does not match the deployment project.");
  }
}

console.log(`Firebase Hosting output verified: ${files.length} files`);
