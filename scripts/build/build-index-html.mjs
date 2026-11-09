import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize } from "parse5";

import { readIndexHtmlSource } from "./index-html-source.mjs";
import { pageNames } from "./web-files.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..");
const buildRoot = process.env.AXIS_BUILD_ROOT || projectRoot;
const inlineRoot = resolve(buildRoot, "dist/pages/inline");
await mkdir(inlineRoot, {recursive:true});
async function preparePage(source, name) {
  const document = parse(source);
  const scripts = [];
  function visit(node) {
    if (node.tagName === "script" && !node.attrs.some(attr => attr.name === "src")) scripts.push(node);
    for (const child of node.childNodes || []) visit(child);
  }
  visit(document);
  for (const [index, script] of scripts.entries()) {
    const source = script.childNodes.map(node => node.value || "").join("");
    if (!source.trim()) continue;
    const file = `${name}-${index}.js`;
    await writeFile(resolve(inlineRoot, file), source.replace(/(["'])\.\/dist\//gu, "$1/dist/"), "utf8");
    script.childNodes = [];
    script.attrs.push({name:"src",value:`dist/pages/inline/${file}`});
  }
  return serialize(document);
}
const outputPath = resolve(buildRoot, "build/pages/index.html");
const outputHtml = await readIndexHtmlSource(projectRoot);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, await preparePage(outputHtml, "index"), "utf8");

console.log(`Index HTML rebuilt from partials -> ${outputPath}`);

// Keep the profile/account source shells in sync with the shared sidebar partial.
const sidebar = await readFile(resolve(projectRoot, "src/client/index-partials/sidebar.html"), "utf8");
for (const name of pageNames.filter(name => name !== "index")) {
  const page = name + ".html";
  const path = resolve(projectRoot, "src/client/pages", page);
  const source = await readFile(path, "utf8");
  const marker = /<!-- shared-sidebar:start -->[\s\S]*?<!-- shared-sidebar:end -->/;
  const output = marker.test(source) ? source.replace(marker, "<!-- shared-sidebar:start -->\n" + sidebar.trim() + "\n<!-- shared-sidebar:end -->") : source;
  await writeFile(resolve(buildRoot, "build/pages", page), await preparePage(output, name), "utf8");
}
