import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pageNames, styleNames, assetNames, webFile } from "./web-files.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const publicRoot = resolve(projectRoot, process.env.FIREBASE_CONFIG_MODE === "emulator" ? "build/emulator-hosting" : "dist-hosting");

const runtimeEntries = [...pageNames.map(name => name + ".html"), ...styleNames, ...assetNames, "sw.js", "dist"];

async function removeFilesByExtension(root, extension) {
  const entries = await readdir(root, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const entryPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      await removeFilesByExtension(entryPath, extension);
      return;
    }
    if (entry.isFile() && entry.name.endsWith(extension)) {
      await rm(entryPath, { force: true });
    }
  }));
}

await rm(publicRoot, { recursive: true, force: true });
await mkdir(publicRoot, { recursive: true });

for (const entry of runtimeEntries) {
  await cp(webFile(projectRoot, entry), resolve(publicRoot, entry), {
    recursive: true,
    force: true,
    dereference: true
  });
}

await removeFilesByExtension(publicRoot, ".map");

console.log(`Firebase Hosting public directory prepared: ${publicRoot}`);
