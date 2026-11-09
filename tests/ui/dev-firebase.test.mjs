import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

async function freePort() {
  const server = createServer();
  await new Promise((accept, reject) => server.once("error", reject).listen(0, "127.0.0.1", accept));
  const { port } = server.address();
  await new Promise(accept => server.close(accept));
  return port;
}

test("Firebase dev reload publishes successful client changes and preserves browser auth", { timeout: 120000 }, async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), "axis-dev-reload-"));
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  let child, exited, browser;
  let output = "";
  const until = async (condition, timeout = 15000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await condition()) return;
      if (child?.exitCode != null) break;
      await delay(100);
    }
    assert.fail(`Dev server condition did not complete:\n${output.slice(-3200)}`);
  };
  try {
    for (const path of ["src", "config", "scripts/build", "scripts/dev"]) {
      await mkdir(resolve(fixture, path), { recursive: true });
      await cp(resolve(path), resolve(fixture, path), { recursive: true });
    }
    await symlink(resolve("node_modules"), resolve(fixture, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    await writeFile(resolve(fixture, "package.json"), '{"type":"module"}');
    await writeFile(resolve(fixture, ".env"), [
      "FIREBASE_WEB_PROJECT_ID=axis-reload-fixture", "FIREBASE_WEB_API_KEY=fixture-key",
      "FIREBASE_WEB_AUTH_DOMAIN=axis-reload-fixture.firebaseapp.com",
      "FIREBASE_WEB_STORAGE_BUCKET=axis-reload-fixture.appspot.com",
      "FIREBASE_WEB_MESSAGING_SENDER_ID=1234", "FIREBASE_WEB_APP_ID=1:1234:web:fixture"
    ].join("\n"));
    child = spawn(process.execPath, ["scripts/dev/firebase.mjs"], {
      cwd: fixture, env: { ...process.env, AXIS_DEV_PORT: String(port), FIREBASE_CONFIG_MODE: "emulator" },
      windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
    });
    exited = new Promise(accept => child.once("close", accept));
    for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => { output += chunk; });
    await until(() => output.includes(`${url}/login.html`), 40000);
    assert.equal((await fetch(`${url}/.env`)).status, 404);
    assert.equal((await fetch(`${url}/login.html`)).headers.get("cache-control"), "no-store");
    browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const emulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    await page.route("**/*", async route => {
      const target = new URL(route.request().url());
      if (target.origin === url && target.pathname === "/dist/firebase.js" && /^127\.0\.0\.1:\d+$/u.test(emulator || "")) {
        const response = await route.fetch();
        return route.fulfill({ response, body: (await response.text()) + `\nimport { connectAuthEmulator } from "./infrastructure/firebase/auth.js";\nconnectAuthEmulator(auth, "http://${emulator}", {disableWarnings: true});` });
      }
      return target.origin === url || target.host === emulator ? route.continue() : route.abort();
    });
    let navigations = 0;
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations++; });
    const events = () => page.waitForResponse(response => response.url() === `${url}/__axis_dev/events`);
    await Promise.all([events(), page.goto(`${url}/login.html`)]);
    const project = await page.evaluate(async () => (await import("/dist/firebase.js")).app.options.projectId);
    assert.equal(project, "axis-reload-fixture");
    const uid = /^127\.0\.0\.1:\d+$/u.test(emulator || "") ? await page.evaluate(async () => {
      const { auth } = await import("/dist/firebase.js");
      const { createUserWithEmailAndPassword } = await import("/dist/infrastructure/firebase/auth.js");
      return (await createUserWithEmailAndPassword(auth, `reload-${crypto.randomUUID()}@axis.invalid`, "Synthetic-1234")).user.uid;
    }) : null;
    const update = async (write) => {
      const before = navigations;
      await Promise.all([events(), write()]);
      assert.equal(navigations, before + 1);
    };
    const css = resolve(fixture, "src/client/styles/style.css");
    await update(() => appendFile(css, "\n:root { --axis-reload-test: 42; }\n"));
    assert.match(await (await fetch(`${url}/style.css`)).text(), /--axis-reload-test: 42/);
    assert.match(output, /Rebuilding: assets/);
    const html = resolve(fixture, "src/client/pages/login.html");
    const htmlSource = await readFile(html, "utf8");
    await update(() => writeFile(html, htmlSource.replace("</body>", '<span id="reload-test" hidden>updated</span></body>')));
    assert.equal(await page.locator("#reload-test").textContent(), "updated");
    const ts = resolve(fixture, "src/client/utils.ts");
    const tsSource = await readFile(ts, "utf8");
    const beforeError = navigations;
    await appendFile(ts, "\nconst axisReloadInvalid = ;\n");
    await until(() => output.includes("Keeping the last successful build"));
    assert.equal(navigations, beforeError);
    assert.equal((await fetch(`${url}/dist/utils.js`)).status, 200);
    await update(() => writeFile(ts, tsSource + "\nexport const axisReloadTest = 42;\n"));
    assert.equal(await page.evaluate(async () => (await import("/dist/utils.js")).axisReloadTest), 42);
    const envFile = resolve(fixture, ".env");
    const envSource = await readFile(envFile, "utf8");
    await update(() => writeFile(envFile, envSource.replace("MESSAGING_SENDER_ID=1234", "MESSAGING_SENDER_ID=5678")));
    assert.equal(await page.evaluate(async () => (await import("/dist/firebase.js")).app.options.messagingSenderId), "5678");
    if (uid) {
      assert.equal(await page.evaluate(async () => {
        const { auth } = await import("/dist/firebase.js");
        await auth.authStateReady();
        return auth.currentUser?.uid;
      }), uid);
    }
    assert.deepEqual(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
    await delay(400);
    assert.equal(navigations, 5);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    child?.kill();
    await exited;
    await rm(fixture, { recursive: true, force: true });
  }
});
