import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const buildRoot = process.env.AXIS_BUILD_ROOT || projectRoot;
const distRoot = resolve(buildRoot, "dist");

const copies = [
  { from: resolve(projectRoot, "node_modules/chart.js/dist/chart.umd.min.js"), to: resolve(distRoot, "vendor/chart.js") },
  { from: resolve(projectRoot, "node_modules/jspdf/dist/jspdf.umd.min.js"), to: resolve(distRoot, "vendor/jspdf.js") },
  { from: resolve(projectRoot, "node_modules/chart.js/LICENSE.md"), to: resolve(distRoot, "vendor/licenses/chart.js.txt") },
  { from: resolve(projectRoot, "node_modules/jspdf/LICENSE"), to: resolve(distRoot, "vendor/licenses/jspdf.txt") },
  {
    from: resolve(projectRoot, "src", "client", "app", "modules", "summary", "analytics-block.css"),
    to: resolve(distRoot, "modules", "summary", "analytics-block.css")
  },
  {
    from: resolve(projectRoot, "src", "client", "app", "modules", "summary", "analytics-block.html"),
    to: resolve(distRoot, "modules", "summary", "analytics-block.html")
  }
];

for (const entry of copies) {
  await mkdir(dirname(entry.to), { recursive: true });
  await copyFile(entry.from, entry.to);
}

console.log("Client postbuild complete:");
for (const entry of copies) {
  console.log(`- copied ${entry.to}`);
}

await build({
  entryPoints: [resolve(projectRoot, "src/client/infrastructure/api/client.ts")],
  outfile: resolve(distRoot, "infrastructure/api/client.js"),
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true
});

await build({
  entryPoints: [resolve(projectRoot, "src/client/shared/i18n/index.ts")],
  outfile: resolve(distRoot, "shared/i18n/index.js"),
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true
});

// Build one shared Firebase runtime; every feature imports these local facades.
await build({
  entryPoints: ["app", "auth", "firestore"].map(name => resolve(projectRoot, `src/client/infrastructure/firebase/${name}.ts`)),
  outdir: resolve(distRoot, "infrastructure/firebase"),
  entryNames: "[name]", chunkNames: "chunks/[name]-[hash]", splitting: true,
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true
});

await build({ entryPoints: [resolve(projectRoot, "src/shared/bim/publication.ts")], outfile: resolve(distRoot, "infrastructure/bim-publication.js"), bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true });

await build({ entryPoints: [resolve(projectRoot, "src/shared/documents.ts")], outfile: resolve(distRoot, "infrastructure/document-validation.js"), bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true });
