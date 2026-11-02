import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readIndexHtmlSource } from "./index-html-source.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const outputPath = resolve(projectRoot, "index.html");
const outputHtml = await readIndexHtmlSource(projectRoot);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, outputHtml, "utf8");

console.log(`Index HTML rebuilt from partials -> ${outputPath}`);

// Keep the profile/account source shells in sync with the shared sidebar partial.
const sidebar = await readFile(resolve(projectRoot, "src/client/index-partials/sidebar.html"), "utf8");
for (const page of ["profile.html", "edit-profile.html"]) {
  const path = resolve(projectRoot, page);
  const source = await readFile(path, "utf8");
  const marker = /<!-- shared-sidebar:start -->[\s\S]*?<!-- shared-sidebar:end -->/;
  if (!marker.test(source)) throw new Error("Missing shared sidebar slot in " + page);
  await writeFile(path, source.replace(marker, "<!-- shared-sidebar:start -->\n" + sidebar.trim() + "\n<!-- shared-sidebar:end -->"), "utf8");
}
