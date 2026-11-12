import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection } from "firebase/firestore";

const project = "demo-axis-test"; // Firebase's reserved emulator-only project prefix.
const config = JSON.parse(await readFile("firebase.emulator.json", "utf8"));
export const emulatorEnvironment = {
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${config.emulators.firestore.port}`,
  FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${config.emulators.auth.port}`,
  FIREBASE_STORAGE_EMULATOR_HOST: `127.0.0.1:${config.emulators.storage.port}`
};

export async function startApp({ width = 1440, height = 1000, theme = "light", authenticated = true, touch = width <= 768, serviceWorkers = "block", browserType = chromium } = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST !== emulatorEnvironment.FIRESTORE_EMULATOR_HOST) throw new Error("Run UI checks through npm run test:ui; a loopback emulator is required.");
  const environment = await initializeTestEnvironment({ projectId: project, firestore: {
    host: "127.0.0.1", port: config.emulators.firestore.port, rules: await readFile("firestore.rules", "utf8")
  } });
  await environment.clearFirestore();
  const email = `inspection-${Date.now()}@axis.invalid`, password = "Synthetic-test-123";
  const response = await fetch(`http://${emulatorEnvironment.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-key`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  if (!response.ok) throw new Error("Could not create isolated test identity");
  const { localId: uid } = await response.json();
  const data = async action => {
    let result;
    await environment.withSecurityRulesDisabled(async context => { result = await action(context.firestore()); });
    return result;
  };
  await data(async db => {
    await setDoc(doc(db, "users", uid), { firstName: "Инженер", lastName: "Контроля", email });
    for (const [id, name] of [["project-main", "Испытательный корпус"], ["project-other", "Второй объект"]]) {
      await setDoc(doc(db, "projects", id), { name, ownerUid: uid, createdBy: uid, engineer: "Инженер Контроля", construction: "foundation_slab", date: "2026-11-03", createdAt: Date.now(), projectGeo: {projX:0,projY:0,projH:0} });
    }
    await setDoc(doc(db, "projects/project-main/geomChecks/saved-geometry"), {
      projectId: "project-main", ownerUid: uid, createdBy: uid, evaluationSchemaVersion: 2,
      module: "Геометрия", construction: "foundation_slab", constructionCategory: "foundation", constructionLabel: "Монолитная железобетонная плита",
      floor: "-1", location: "А-Г, 1-4", axisLetterFrom: "А", axisLetterTo: "Г", axisNumberFrom: "1", axisNumberTo: "4",
      projPlateHeight: 500, factPlateHeight: 514, createdAt: Date.now(), status: "incomplete"
    });
    await setDoc(doc(db, "projects/project-main/inspections/saved-geometry"), {
      projectId: "project-main", sourceId: "saved-geometry", sourceCollection: "geomChecks", moduleKey: "geometry", module: "Геометрия",
      construction: "foundation_slab", location: "А-Г, 1-4", status: "incomplete", checkStatus: "incomplete", createdAt: Date.now()
    });
    await setDoc(doc(db, "journal/saved-geometry-event"), {
      projectId: "project-main", ownerUid: uid, createdBy: uid, sourceId: "saved-geometry", sourceCollection: "geomChecks",
      module: "Геометрия", construction: "foundation_slab", context: "А-Г, 1-4", status: "incomplete", timestamp: Date.now(), details: "500/514 мм"
    });
  });
  const server = spawn(process.execPath, ["server/dist/server/src/index.js"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: {
    ...process.env, ...emulatorEnvironment, FIREBASE_PROJECT_ID: project, GCLOUD_PROJECT: project,
    FIREBASE_STORAGE_BUCKET: `${project}.appspot.com`, LOCAL_FIREBASE_EMULATORS: "true", AUTH_REQUIRED: "true",
    LOCAL_CLIENT_ROOT: resolve("build/emulator-hosting"), PORT: "5051", ALLOWED_ORIGINS: "http://127.0.0.1:5051"
  } });
  let serverOutput = "";
  server.stdout.on("data", chunk => { serverOutput += chunk; });
  server.stderr.on("data", chunk => { serverOutput += chunk; });
  const browser = await browserType.launch({ headless: true, ...(browserType === chromium && process.platform === "win32" ? { channel: "chrome" } : {}) });
  const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch, reducedMotion: "reduce", serviceWorkers });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const close = async () => {
    await browser.close(); server.kill(); await environment.cleanup();
  };
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode != null) throw new Error("Local API stopped: " + serverOutput);
      if (await fetch("http://127.0.0.1:5051/login.html").then(r => r.ok, () => false)) { ready = true; break; }
      await delay(100);
    }
    if (!ready) throw new Error("Local API did not start: " + serverOutput);
    await page.addInitScript(value => localStorage.setItem("app_theme", value), theme);
    await page.goto("http://127.0.0.1:5051/login.html");
    if (authenticated) {
      await page.locator("#loginEmail").fill(email);
      await page.locator("#loginPassword").fill(password);
      await page.locator("#btnLogin").click();
      await page.waitForURL("**/index.html");
      await page.locator('#projectSelector option[value="project-main"]').waitFor({ state: "attached" });
      await page.locator("#projectSelector").selectOption("project-main");
      await page.locator("#overview.active").waitFor();
      await page.locator("#welcomeAnimation").waitFor({state:"hidden"});
    }
    return { page, browser, email, password, uid, errors, close, url: "http://127.0.0.1:5051",
      user: () => data(async db => (await getDoc(doc(db, "users", uid))).data()),
      read: (name, id) => data(async db => (await getDoc(doc(db, "projects/project-main", name, id))).data()),
      records: name => data(async db => (await getDocs(collection(db, "projects/project-main", name))).docs.map(d => ({ id:d.id,...d.data() }))),
      seed: (path, value) => data(db => setDoc(doc(db, path), value)),
      async capture(name) { await mkdir("output/playwright/main-app", {recursive:true}); await page.screenshot({path: `output/playwright/main-app/${name}.png`,fullPage:true,animations:"disabled"}); }
    };
  } catch (error) {
    await mkdir("output/playwright/main-app", {recursive:true});
    await page.screenshot({path:"output/playwright/main-app/failed-start.png"}).catch(()=>{});
    const message = await page.locator("#authMessage").textContent().catch(()=>"");
    await close(); throw new Error(`${error.message}\nBrowser: ${errors.join("; ")}\nAuth: ${message}`, {cause:error});
  }
}

/** Real touch input through Chromium's input stack, not synthetic DOM dispatch. */
export async function swipe(page, from, to, { cancel = false } = {}) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y }] });
  for (let i=1;i<=8;i++) await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x:from.x+(to.x-from.x)*i/8, y:from.y+(to.y-from.y)*i/8 }] });
  await session.send("Input.dispatchTouchEvent", { type: cancel ? "touchCancel" : "touchEnd", touchPoints: [] });
  await session.detach();
}

export async function openSection(page, target) {
  if (page.viewportSize().width <= 768 && await page.locator('.sidebar-drawer').getAttribute('data-state') === 'closing') {
    await page.locator('.sidebar-drawer').waitFor({state:'hidden'});
  }
  if (page.viewportSize().width <= 768 && !await page.locator(".sidebar-drawer").evaluate(e=>e.open)) {
    if (page.context().browser().browserType().name() === "chromium") {
      await swipe(page, {x:8,y:300}, {x:180,y:300});
    } else {
      await page.locator("#mobileSidebarToggle").click();
    }
    await page.locator(".sidebar-drawer[open]").waitFor();
  }
  await page.locator(`#workspaceSidebar [data-target="${target}"]`).click();
  await page.locator(`#${target}.active`).waitFor();
  if (page.viewportSize().width <= 768) await page.locator('.sidebar-drawer').waitFor({state:'hidden'});
}
