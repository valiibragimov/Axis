import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import vm from "node:vm";

test("service worker bypasses Firebase and private requests and handles cache write rejection", async () => {
  const listeners = new Map();
  let writes = 0, reads = 0;
  const cacheError = new DOMException("Cache write interrupted", "AbortError");
  const warnings = [];
  const source = await transform(await readFile("src/client/sw.ts", "utf8"), { loader: "ts" });
  vm.runInNewContext(source.code, {
    self: { location: { origin: "https://example.test" }, registration: { scope: "https://example.test/" }, addEventListener: (name, callback) => listeners.set(name, callback) },
    URL, Request, Response, console: { warn: (...args) => warnings.push(args) },
    fetch: async () => ({ status: 200, type: "basic", headers: new Headers(), clone() { return this; } }),
    caches: { open: async () => ({ put: async () => { writes++; throw cacheError; } }), match: async () => { reads++; return new Response("old private PDF"); } }
  });
  let response;
  listeners.get("fetch")({ request: new Request("https://example.test/documents/file?projectId=p", { headers: { Authorization: "Bearer synthetic" } }), respondWith: promise => { response = promise; } });
  for (const url of [
    "http://127.0.0.1:38085/google.firestore.v1.Firestore/Listen/channel",
    "https://apis.google.com/js/api.js",
    "https://example.test/__/auth/handler"
  ]) {
    listeners.get("fetch")({ request: new Request(url), respondWith: () => assert.fail(`Service worker intercepted ${url}`) });
  }
  if (response) await response;
  await Promise.resolve();
  assert.equal(writes, 0);
  assert.equal(reads, 0);

  let cacheWrite;
  listeners.get("fetch")({
    request: new Request("https://example.test/dist/app.js"),
    waitUntil: promise => { cacheWrite = promise; },
    respondWith: promise => { response = promise; }
  });
  assert.equal((await response).status, 200);
  await cacheWrite;
  assert.equal(writes, 1);
  assert.equal(warnings[0].at(-1), cacheError);
});
