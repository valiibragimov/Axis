import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { assetNames, pageNames, styleNames, webFile } from "../build/web-files.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env.AXIS_DEV_PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("AXIS_DEV_PORT must be a valid TCP port.");
const workspace = resolve(root, "build/dev-firebase");
await mkdir(workspace, { recursive: true });
const runRoot = await mkdtemp(resolve(workspace, "run-"));
const abort = new AbortController();
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^FIREBASE_(?:WEB_|CONFIG_MODE$)/i.test(key)));
const clients = new Set();
const watchers = [];
const pending = new Set();
let retry = new Set();
let current, previous, activeBuild, timer, heartbeat;

function run(script, buildRoot, args = []) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root, env: { ...env, AXIS_BUILD_ROOT: buildRoot }, stdio: "inherit", windowsHide: true,
      signal: abort.signal
    });
    // Wait for close even after abort, so cleanup cannot race with the child.
    let error;
    child.once("error", failure => { error = failure; });
    child.once("close", code => code === 0 && !error ? resolveRun() : reject(error ?? new Error(`${script} failed (${code})`)));
  });
}

async function build(changes) {
  const first = !current;
  const compile = first || changes.has("ts");
  const html = first || changes.has("html");
  const bim = first || changes.has("bim");
  const feed = first || changes.has("feed");
  if (!compile && !html && !bim && !feed) return current.directory;
  const directory = await mkdtemp(resolve(runRoot, "generation-"));
  const copy = (path) => cp(resolve(current.directory, path), resolve(directory, path), { recursive: true });
  try {
    if (compile) {
      await run("node_modules/typescript/bin/tsc", directory, ["-p", "config/typescript/tsconfig.client.json", "--outDir", resolve(directory, "dist")]);
      await run("scripts/build/inject-firebase-config.mjs", directory);
      await run("scripts/build/postbuild-client.mjs", directory);
      if (!bim) await copy("dist/app/vendor");
      if (!feed) await copy("dist/profile-feed.json");
      if (!html) await copy("dist/pages");
    } else {
      await copy("dist");
    }
    if (html) await run("scripts/build/build-index-html.mjs", directory);
    else await copy("build/pages");
    if (bim) await run("scripts/build/build-bim-viewer.mjs", directory);
    if (feed) await run("scripts/build/build-profile-feed.mjs", directory);
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function publish(directory) {
  if (current && directory !== current.directory) {
    if (previous) rm(previous, { recursive: true, force: true }).catch(error => console.warn("[dev:firebase]", error.message));
    previous = current.directory;
  }
  current = { directory, revision: randomUUID() };
  for (const client of clients) client.write(`data: ${current.revision}\n\n`);
}

function schedule(...changes) {
  for (const change of changes) pending.add(change);
  clearTimeout(timer);
  timer = setTimeout(flush, 140);
}

function flush() {
  if (activeBuild || !pending.size || abort.signal.aborted) return;
  const changes = new Set([...retry, ...pending]);
  pending.clear();
  activeBuild = (async () => {
    try {
      console.log(`[dev:firebase] Rebuilding: ${[...changes].join(", ")}`);
      const directory = await build(changes);
      if (!abort.signal.aborted) publish(directory);
      retry.clear();
      console.log("[dev:firebase] Ready.");
    } catch (error) {
      retry = changes;
      if (!abort.signal.aborted) console.error(`[dev:firebase] ${error.message}. Keeping the last successful build.`);
    } finally {
      activeBuild = undefined;
      if (pending.size && !abort.signal.aborted) schedule();
    }
  })();
}

function sourceChanged(_event, name) {
  const path = name?.replaceAll("\\", "/");
  if (!path) return schedule("ts", "html", "bim", "feed");
  if (/^client\/(assets|styles)\//u.test(path) || /^client\/app\/modules\/summary\/analytics-block\.(?:css|html)$/u.test(path)) return schedule("assets");
  if (/^client\/(pages|index-partials)\//u.test(path)) return schedule("html");
  if (/^client\/app\/(vendor-src\/|services\/ifc-(?:file-cache|identity|diagnostics)\.ts$)/u.test(path) || path === "shared/bim/ifc-model.ts") return schedule("ts", "bim");
  if (path === "shared/profile-feed.ts") return schedule("feed");
  if (!extname(path)) return schedule("ts", "html", "bim", "feed");
  if (/^(client|shared)\/.*\.ts$/u.test(path)) schedule("ts");
}

const mime = {
  ".css": "text/css", ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".ttf": "font/ttf", ".woff2": "font/woff2", ".wasm": "application/wasm"
};
const pages = new Set(pageNames.map(name => `${name}.html`));
const reloadScript = await readFile(new URL("./reload-browser.js", import.meta.url));
const retireWorker = 'self.addEventListener("install", event => event.waitUntil(self.skipWaiting())); self.addEventListener("activate", event => event.waitUntil(self.registration.unregister()));';

const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) return response.writeHead(403).end();
  if (!["GET", "HEAD"].includes(request.method)) return response.writeHead(405).end();
  let path;
  try { path = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).slice(1) || "index.html"; }
  catch { return response.writeHead(400).end(); }
  if (path.split("/").some(part => !part || part.startsWith(".")) || /[\\:]/u.test(path) || Array.from(path).some(character => character.charCodeAt(0) < 32)) return response.writeHead(404).end();
  if (path === "__axis_dev/events" && request.method === "GET") {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write(`data: ${current.revision}\n\n`);
    clients.add(response);
    response.on("close", () => clients.delete(response));
    return;
  }
  const type = mime[extname(path)];
  if (!type) return response.writeHead(404).end();
  let contents;
  try {
    if (path === "__axis_dev/reload.js") contents = reloadScript;
    else if (path === "sw.js") contents = retireWorker;
    else if (pages.has(path)) {
      const { directory, revision } = current;
      const html = await readFile(webFile(directory, path), "utf8");
      contents = html.replace("<html", "<html data-axis-dev")
        .replace("</head>", `<script defer src="/__axis_dev/reload.js?revision=${revision}"></script></head>`);
    } else if (/^dist\/modules\/summary\/analytics-block\.(?:css|html)$/u.test(path)) {
      contents = await readFile(resolve(root, "src/client/app", path.slice(5)));
    } else if (path.startsWith("dist/")) contents = await readFile(resolve(current.directory, path));
    else if (styleNames.includes(path) || assetNames.some(name => path === name || path.startsWith(name + "/"))) {
      contents = await readFile(webFile(root, path));
    } else return response.writeHead(404).end();
  } catch (error) {
    if (!["ENOENT", "EISDIR", "ENOTDIR"].includes(error.code)) console.error("[dev:firebase]", error.message);
    return response.writeHead(404).end();
  }
  return response.writeHead(200, { "Content-Type": type }).end(request.method === "HEAD" ? undefined : contents);
});

async function stop() {
  if (abort.signal.aborted) return;
  abort.abort();
  clearTimeout(timer);
  clearInterval(heartbeat);
  for (const watcher of watchers) watcher.close();
  for (const client of clients) client.end();
  server.close();
  await activeBuild?.catch(() => {});
  await rm(runRoot, { recursive: true, force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop().catch(console.error));

try {
  watchers.push(watch(resolve(root, "src"), { recursive: true }, sourceChanged));
  watchers.push(watch(root, (_event, name) => { if (name === ".env") schedule("ts"); }));
  activeBuild = build(new Set());
  const directory = await activeBuild;
  if (abort.signal.aborted) throw abort.signal.reason;
  publish(directory);
  activeBuild = undefined;
  if (pending.size) schedule();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolveListen(); });
  });
  heartbeat = setInterval(() => { for (const client of clients) client.write(": keep-alive\n\n"); }, 20000);
  console.log(`[dev:firebase] http://127.0.0.1:${port}/login.html`);
} catch (error) {
  if (!abort.signal.aborted) console.error(`[dev:firebase] ${error.message}`);
  activeBuild = undefined;
  await stop();
  process.exitCode = 1;
}
