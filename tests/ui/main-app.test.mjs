import test from "node:test";
import assert from "node:assert/strict";
import { chromium, firefox } from "playwright";
import { startApp, swipe, openSection } from "./helpers/production-app.mjs";

const sections = ["overview", "controlPlan", "journal", "geo", "reinforcement", "geometry", "strength", "summary", "knowledge", "documents"];
const selectedBrowser = process.env.AXIS_TEST_BROWSER === "firefox" ? firefox : chromium;

test("charts and PDF load from the application under its real CSP", {timeout:45000}, async()=>{
  const app=await startApp();
  try {
    const result=await app.page.evaluate(async()=>{
      const libs=await import('/dist/app/ui/lazy-libs.js');
      const loaded=await Promise.all([libs.ensureChartJsLoaded(),libs.ensureJsPdfLoaded()]);
      const canvas=document.createElement('canvas'); document.body.append(canvas);
      const chart=new window.Chart(canvas,{type:'bar',data:{labels:['A'],datasets:[{data:[1]}]},options:{animation:false}});
      const chartReady=chart.data.datasets[0].data[0]===1; chart.destroy();canvas.remove();
      const pdf=new window.jspdf.jsPDF();pdf.text('Axis',10,10);
      return {loaded,chartReady,pdf:pdf.output().slice(0,5),sources:[...document.querySelectorAll('[data-lazy-lib]')].map(script=>new URL(script.src).origin===location.origin)};
    });
    assert.deepEqual(result,{loaded:[true,true],chartReady:true,pdf:'%PDF-',sources:[true,true]});
  }finally{await app.close();}
});

for (const theme of ["light", "dark"]) {
  test(`main application: responsive pages and account drawer in ${theme} theme`, {timeout:120000}, async () => {
    const app = await startApp({theme,touch:true,browserType:selectedBrowser});
    const {page} = app;
    try {
      assert.equal(await page.locator("#bottomNav").count(),0);
      for (const width of [1440,820,768,390,320]) {
        await page.setViewportSize({width,height:1000});
        for (const target of sections) {
          await openSection(page,target);
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${target} ${width}: overflow`);
          if (target==="geometry" && width<=768) await page.locator('#geometry [data-wizard-step="2"]').click();
          if ([1440,390].includes(width) && ["overview","geometry","summary"].includes(target)) await app.capture(`${target}-${theme}-${width}`);
        }
        if (width === 1440) {
          const account = page.locator("#headerProfileButton");
          await account.click();
          const menu = page.locator("#accountMenu");
          await menu.waitFor();
          const bounds = await menu.boundingBox();
          const sidebar = await page.locator("#workspaceSidebar").boundingBox();
          const trigger = await account.boundingBox();
          assert.ok(bounds.x >= sidebar.x && bounds.x + bounds.width <= sidebar.x + sidebar.width + 1);
          assert.ok(bounds.y + bounds.height <= trigger.y, "The menu must open above the trigger");
          assert.equal(await menu.evaluate(element => {
            const {x, y, width, height} = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(x + width / 2, y + height / 2));
          }), true, "The desktop menu must not be clipped or covered");
          await app.capture(`account-${theme}-1440`);
          await page.keyboard.press("Escape");
        }
        if (width<=768) {
          await page.locator('.sidebar-drawer').waitFor({state:'hidden'});
          const opener = page.locator('#mobileSidebarToggle');
          assert.equal(await opener.isVisible(), true);
          const bounds = await opener.boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.y >= 0);
          assert.equal(await page.locator("#sidebarToggle").isVisible(),false);
          assert.equal(await page.locator("#headerProfileButton").isVisible(),false);
          if (selectedBrowser === chromium) await swipe(page,{x:8,y:300},{x:180,y:300});
          else await opener.click();
          const drawer=page.locator(".sidebar-drawer");
          await drawer.waitFor({state:"visible"});
          assert.equal(await drawer.evaluate(e=>e.matches(":modal")),true);
          const account=page.locator("#headerProfileButton");
          assert.equal(await account.locator("xpath=ancestor::*[@id='workspaceSidebar']").count(),1);
          await account.click();
          await page.locator("#accountMenu").waitFor();
          const menu=await page.locator("#accountMenu").boundingBox();
          assert.ok(menu.x>=0 && menu.x+menu.width<=width+1);
          await page.keyboard.press("Escape");
          // First Escape dismisses the nested account menu; it must not dismiss navigation.
          assert.equal(await drawer.evaluate(e=>e.open),true);
          assert.equal(await drawer.getAttribute('data-state'),'open');
          assert.equal(await opener.getAttribute('aria-expanded'),'true');
          if(width===390) await app.capture(`drawer-${theme}`);
          if (selectedBrowser === chromium) await swipe(page,{x:220,y:300},{x:40,y:300});
          else await page.keyboard.press("Escape");
          await drawer.waitFor({state:"hidden"});
        }
      }
      assert.deepEqual(app.errors,[]);
    } finally {await app.close();}
  });
}

test("mobile panel respects vertical, short, cancelled and non-edge gestures", {timeout:45000}, async()=>{
  const app=await startApp({width:390}); const {page}=app;
  try {
    const drawer=page.locator(".sidebar-drawer");
    for(const [from,to,cancel] of [
      [{x:180,y:300},{x:300,y:300},false],
      [{x:8,y:300},{x:35,y:300},false],
      [{x:8,y:400},{x:12,y:200},false],
      [{x:8,y:300},{x:180,y:300},true]
    ]) {await swipe(page,from,to,{cancel});await drawer.waitFor({state:'hidden'});assert.equal(await drawer.evaluate(e=>e.open),false);}
    await swipe(page,{x:8,y:300},{x:180,y:300});await drawer.waitFor();
    await page.keyboard.press("Escape");await drawer.waitFor({state:"hidden"});
    const opener=page.locator("#mobileSidebarToggle");await opener.focus();await opener.press("Enter");await drawer.waitFor();
    await page.keyboard.press("Escape");await drawer.waitFor({state:'hidden'});assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
    await page.setViewportSize({width:1440,height:1000});
    await page.locator("#sidebarToggle").click();
    assert.equal(Math.round((await page.locator("#workspaceSidebar").boundingBox()).width),64);
    await page.setViewportSize({width:390,height:480});await swipe(page,{x:8,y:240},{x:180,y:240});
    await page.locator("#headerProfileButton").scrollIntoViewIfNeeded();assert.equal(await page.locator("#headerProfileButton").isVisible(),true);
    await page.setViewportSize({width:1440,height:1000});
    await page.waitForFunction(() => {
      const sidebar = document.getElementById("workspaceSidebar");
      return sidebar && Math.round(sidebar.getBoundingClientRect().width) === 64;
    });
    assert.equal(await drawer.evaluate(e=>e.open),false);
  }finally{await app.close();}
});

test("saved geometry uses real Firestore, keyboard actions and project isolation", {timeout:60000}, async()=>{
  const app=await startApp({ browserType: selectedBrowser });const {page}=app;
  try {
    await openSection(page,"geometry");
    const card=page.locator("#geomChecksList .node").first();await card.waitFor();
    await card.locator('[data-act="del"]').press("Enter");await page.locator(".confirm-popover").waitFor();
    assert.equal(await page.locator("#factPlateHeight").inputValue(),"");
    await page.keyboard.press("Escape");await card.locator(".node-open-button").press("Enter");
    await page.waitForFunction(()=>document.getElementById("factPlateHeight").value==="514");
    await page.locator("#factPlateHeight").fill("500");await page.locator("#btnGeom").click();
    await page.waitForFunction(()=>!document.getElementById("btnGeom").disabled);
    for(let i=0;i<50;i++){if((await app.read("geomChecks","saved-geometry"))?.factPlateHeight===500)break;await page.waitForTimeout(100);}
    assert.equal((await app.read("geomChecks","saved-geometry")).factPlateHeight,500);
    assert.equal((await app.records("geomChecks")).length,1,"Updating a saved record must retain its identity");
    await page.locator('#geometry[data-inspection-mode="saved"]').waitFor();
    await openSection(page, "journal");
    const legacyRow = page.locator('#journalTable tbody tr[data-source-id="saved-geometry"]');
    await legacyRow.waitFor();
    assert.equal(await legacyRow.count(), 1);
    assert.equal(await legacyRow.getAttribute("data-entry-id"), "saved-geometry-event");
    await openSection(page, "geometry");
    await page.locator("#geomAxisNumberTo").selectOption("5");
    await page.locator("#factPlateHeight").fill("501");
    await page.locator("#btnGeom").click();
    await page.locator('#geometry[data-inspection-mode="saved"]').waitFor();
    const geometry = await app.records("geomChecks");
    assert.equal(geometry.length, 2);
    assert.equal(geometry.find(record => record.id === "saved-geometry").factPlateHeight, 500);
    const second = geometry.find(record => record.id !== "saved-geometry");
    assert.equal(second.axisNumberTo, "5");
    assert.equal(second.factPlateHeight, 501);
    await page.reload();
    await openSection(page,"geometry");
    await page.locator("#geomChecksList .node").filter({ hasText: "1-4" }).locator(".node-open-button").click();
    await page.waitForFunction(()=>document.getElementById("factPlateHeight").value==="500");
    await page.evaluate(() => {
      document.addEventListener("app:project-context-updated", event => {
        document.documentElement.dataset.testLoadedProject = event.detail.projectId;
      });
    });
    await page.locator("#factPlateHeight").fill("499");
    page.once("dialog", dialog => dialog.dismiss());
    await page.locator("#projectSelector").selectOption("project-other");
    assert.equal(await page.locator("#projectSelector").inputValue(), "project-main");
    assert.equal(await page.locator("#factPlateHeight").inputValue(), "499");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#projectSelector").selectOption("project-other");
    await page.waitForFunction(()=>document.documentElement.dataset.testLoadedProject==="project-other");
    assert.equal(await page.locator("#geomChecksList .node").count(), 0);
    assert.equal(await page.locator("#factPlateHeight").inputValue(), "");
    assert.equal(await page.locator("[data-inspection-dirty]").count(), 0);
    await page.locator("#projectSelector").selectOption("project-main");
    await page.waitForFunction(() => document.documentElement.dataset.testLoadedProject === "project-main", null, { timeout: 10000 });
    await openSection(page, "geometry");
    assert.equal(await page.locator("#geomChecksList .node").count(), 2);
  } finally { await app.close(); }
});

test("profile and settings use the same mobile drawer and persist a real profile edit", {timeout:60000}, async()=>{
  const app=await startApp({width:390});const{page}=app;
  try {
    for(const path of ["profile","edit-profile"]){
      await page.goto(app.url+`/${path}.html`);await page.locator(".sidebar-drawer").waitFor({state:"attached"});
      await page.locator('#mobileSidebarToggle').click();await page.locator(".sidebar-drawer[open]").waitFor();
      assert.equal(await page.locator("#workspaceSidebar #headerProfileButton").isVisible(),true);
      await page.keyboard.press("Escape");await page.locator('.sidebar-drawer').waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await app.capture(`${path}-mobile`);
    }
    await page.waitForFunction(email => document.getElementById("profileEmailInput").value === email && document.getElementById("profileNameInput").value === "Инженер", app.email);
    await page.locator("#profileNameInput").fill("Проверено");
    assert.equal(await page.locator('#profileNameInput').inputValue(), 'Проверено');
    await page.locator("#saveProfileButton").click();
    await page.locator('#profileStatus[data-tone="success"]').waitFor();
    assert.equal((await app.user()).firstName, "Проверено", "Wait for the acknowledged Firestore write before reloading");
    await page.reload();await page.locator("#profileNameInput").waitFor();
    await page.waitForFunction(()=>document.getElementById("profileNameInput").value==="Проверено");
  }finally{await app.close();}
});

test("public pages keep their stable URLs, themes and accessible login validation", {timeout:60000}, async()=>{
  const app=await startApp({width:320,authenticated:false});const{page}=app;
  try {
    await page.locator("#btnLogin").click();assert.equal(await page.locator("#authMessage").isVisible(),true);
    assert.equal(await page.locator("#loginEmail").evaluate(e=>e===document.activeElement),true);
    for(const theme of ["light","dark"]){
      await page.addInitScript(t=>localStorage.setItem("app_theme",t),theme);
      for(const route of ["login","register","about","privacy","404"]){
        await page.goto(app.url+`/${route}.html`);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
        assert.equal(await page.locator("body").evaluate(e=>getComputedStyle(e).backgroundColor),theme==="light"?"rgb(246, 246, 247)":"rgb(19, 20, 22)");
        if(["login","register"].includes(route))assert.ok(Number.parseFloat(await page.locator('input[type="email"]').evaluate(e=>getComputedStyle(e).fontSize))>=16);
      }
    }
  }finally{await app.close();}
});


test("registration, empty project list and legacy inspection persistence with the service worker active", { timeout: 90000 }, async () => {
  const browserType = selectedBrowser;
  const app = await startApp({ authenticated: false, serviceWorkers: "allow", browserType });
  const { page } = app;
  const firestoreRequests = [];
  await page.addInitScript(() => {
    globalThis.cspViolations = [];
    document.addEventListener("securitypolicyviolation", event => {
      globalThis.cspViolations.push(event.violatedDirective);
    });
  });
  page.on("response", response => {
    if (new URL(response.url()).pathname.includes("google.firestore.v1.Firestore")) {
      firestoreRequests.push({
        status: response.status(),
        fromWorker: response.fromServiceWorker(),
        type: response.request().resourceType()
      });
    }
  });
  const email = `registered-${Date.now()}@axis.invalid`;
  const login = async () => {
    await page.locator("#loginEmail").fill(email);
    await page.locator("#loginPassword").fill(app.password);
    await page.locator("#btnLogin").click();
    await page.waitForURL("**/index.html");
  };
  const logout = async () => {
    await page.locator("#headerProfileButton").click();
    await page.locator("#btnLogout").click();
    await page.waitForURL("**/login.html");
  };
  try {
    await page.goto(app.url + "/register.html");
    await page.locator("#registerEmail").fill(email);
    await page.locator("#registerPassword").fill(app.password);
    await page.locator("#btnRegister").click();
    await page.locator("#alertOk").click();
    await page.waitForURL("**/login.html");
    await login();
    await page.locator("#projectSelector option[disabled]").waitFor({ state: "attached" });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    const { uid, projects } = await page.evaluate(async () => {
      const { auth } = await import("/dist/firebase.js");
      const { listUserProjectDocuments } = await import("/dist/app/repositories/firestore-repository.js");
      return { uid: auth.currentUser.uid, projects: (await listUserProjectDocuments(auth.currentUser.uid)).length };
    });
    assert.equal(projects, 0);
    assert.equal(await page.locator("#geometry").evaluate(section => section.inert), true);
    await app.seed("projects/project-main", { name: "Legacy fixture", createdBy: uid, construction: "foundation_slab" });
    await logout();
    await login();
    await page.locator('#projectSelector option[value="project-main"]').waitFor({ state: "attached" });
    await page.locator("#welcomeAnimation").waitFor({ state: "hidden" });
    await openSection(page, "geometry");
    await page.locator("#geomChecksList .node-open-button").first().click();
    await page.waitForFunction(() => document.getElementById("factPlateHeight").value === "514");
    await page.locator("#factPlateHeight").fill("500");
    await page.locator("#btnGeom").click();
    await page.waitForFunction(() => !document.getElementById("btnGeom").disabled);
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await app.read("geomChecks", "saved-geometry")).factPlateHeight === 500) break;
      await page.waitForTimeout(100);
    }
    assert.equal((await app.read("geomChecks", "saved-geometry")).factPlateHeight, 500);
    await page.reload();
    await page.locator('#projectSelector option[value="project-main"]').waitFor({ state: "attached" });
    await openSection(page, "geometry");
    await page.locator("#geomChecksList .node-open-button").first().click();
    await page.waitForFunction(() => document.getElementById("factPlateHeight").value === "500");
    assert.ok(firestoreRequests.some(request => request.status === 200));
    assert.ok(firestoreRequests.every(request => !request.fromWorker));
    assert.ok(firestoreRequests.some(request => request.type === "xhr"), "Firestore WebChannel uses XHR");
    assert.deepEqual(await page.evaluate(() => globalThis.cspViolations), []);
    assert.deepEqual(app.errors, []);
  } finally {
    await app.close();
  }
});

test("geodesy displays the selected bearing-level limit instead of a universal X/Y tolerance", { timeout: 60000 }, async () => {
  const app = await startApp();
  try {
    const { page } = app;
    await openSection(page, "geo");
    const criteria = page.locator("#geo [data-acceptance]");
    await criteria.locator("summary").click();
    await criteria.locator("[data-normative-context]").selectOption("bearing-level");
    assert.match(await criteria.locator("p").innerText(), /5\.12/u);
    await page.locator("#geoPointLabel").fill("Bearing point A");
    assert.match(await page.locator("#tolHField").inputValue(), /-5 … 0/u);
    assert.equal(await page.locator("#projX").isVisible(), false);
    assert.equal(await criteria.locator("[data-reference]").isVisible(), false);
    await page.locator("#projH").fill("10");
    await page.locator("#factH").fill("9.995");
    await page.locator("#btnGeo").click();
    let saved;
    for (let attempt = 0; attempt < 40 && !saved; attempt++) {
      saved = (await app.records("geoNodes"))[0];
      if (!saved) await page.waitForTimeout(100);
    }
    assert.equal(saved?.status, "ok", JSON.stringify({ projH: saved?.projH, factH: saved?.factH, scope: saved?.measurementScope, criteria: saved?.acceptanceCriteria }));
    assert.equal(saved.measurementScope, "height");
    assert.equal(saved.projX, null);
    assert.equal(saved.axisMode, null);
    assert.equal(saved.acceptanceCriteria.normativeRule, "sp70-2026-11-v1/bearing-level");
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test("geodesy saves independent points, edits one ID and records repeat control separately", { timeout: 90000 }, async () => {
  const app = await startApp({ browserType: selectedBrowser });
  const { page } = app;
  try {
    await openSection(page, "geo");
    const criteria = page.locator("#geo [data-acceptance]");
    await criteria.locator("summary").click();
    await criteria.locator("[data-normative-context]").selectOption("bearing-level");
    await page.locator("#projH").fill("10");
    const name = page.locator("#geoPointLabel");
    const fact = page.locator("#factH");
    const save = async () => {
      await page.locator("#btnGeo").click();
      await page.locator('#geo[data-inspection-mode="saved"]').waitFor();
    };
    await name.fill("Point A");
    await fact.fill("10.01");
    await save();
    assert.match(await page.locator("#geoResult").innerText(), /-5 … 0.*СП 70/u);
    const [original] = await app.records("geoNodes");
    assert.equal(original.status, "bad");

    await name.fill("Point B");
    await fact.fill("9.998");
    await save();
    const records = await app.records("geoNodes");
    assert.equal(records.length, 2);
    const second = records.find(record => record.pointLabel === "Point B");
    assert.notEqual(original.id, second.id);
    assert.equal((await app.read("geoNodes", original.id)).factH, 10.01);


    await page.locator("#geo [data-inspection-search]").fill("Point B");
    assert.equal(await page.locator("#nodesList .node:visible").count(), 1);
    const card = page.locator("#nodesList .node:visible");
    assert.equal(await card.locator(".node-title .node-open-button").count(), 1);
    assert.doesNotMatch(await card.innerText(), /Редактировать/u);
    assert.equal(await card.locator(".node-title").innerText().then(text => text.split("Point B").length - 1), 1);
    await card.locator(".node-open-button").click();
    await page.locator('#geo[data-inspection-mode="edit"]').waitFor();
    await fact.fill("9.997");
    page.once("dialog", dialog => dialog.dismiss());
    await page.locator("#btnClearForm").click();
    assert.equal(await fact.inputValue(), "9.997");
    await save();
    assert.equal((await app.records("geoNodes")).length, 2);
    assert.equal((await app.read("geoNodes", second.id)).factH, 9.997);

    await openSection(page, "journal");
    const linkedRow = page.locator(`#journalTable tbody tr[data-source-id="${second.id}"]`);
    await linkedRow.waitFor();
    assert.equal(await linkedRow.count(), 1, "Editing updates the journal entry for the same inspection");
    await page.locator("#journalTable tbody tr").filter({ hasText: "Point A" }).locator(".journal-issue-btn").click();
    const repeatAction = page.locator(".journal-issue-card__repeat-action");
    await repeatAction.waitFor();
    const [issue] = await app.records("issues");
    assert.equal(issue?.sourceInspectionId, original.id);
    await repeatAction.click();
    await page.locator('#geo[data-inspection-mode="repeat"]').waitFor();
    assert.equal(await fact.inputValue(), "");
    assert.equal(await name.inputValue(), "Point A");
    await page.locator("#btnGeo").click();
    assert.equal((await app.records("geoNodes")).length, 2, "Repeat control requires fresh evidence");
    await fact.fill("9.996");
    await save();
    const afterRepeat = await app.records("geoNodes");
    assert.equal(afterRepeat.length, 3);
    assert.equal((await app.read("geoNodes", original.id)).factH, 10.01);
    const repeat = afterRepeat.find(record => record.factH === 9.996);
    assert.equal((await app.read("issues", issue.id)).repeatControlInspectionId, repeat.id);
    assert.equal(repeat.repeatOf, original.id);
    await name.fill("Point C");
    await fact.fill("");
    await save();
    const pending = (await app.records("geoNodes")).find(record => record.pointLabel === "Point C");
    assert.equal(pending.status, "pending");
    await openSection(page, "journal");
    const pendingRow = page.locator(`#journalTable tbody tr[data-source-id="${pending.id}"]`);
    await pendingRow.locator(".journal-status-badge.pending").waitFor();
    assert.match(await pendingRow.innerText(), /Point C/u);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});


test("reinforcement repeat control waits for the source to load and saves new evidence", { timeout: 60000 }, async () => {
  const app = await startApp({ browserType: selectedBrowser });
  const { page } = app;
  try {
    await openSection(page, "reinforcement");
    const floor = page.locator("#reinfFloor");
    if (await floor.isVisible()) await floor.fill("2");
    await page.locator("#projDia").fill("16");
    const actual = page.locator("#factDia");
    await actual.fill("18");
    const save = async () => {
      await page.locator("#btnReinf").click();
      await page.locator('#reinforcement[data-inspection-mode="saved"]').waitFor();
    };
    await save();
    const [original] = await app.records("reinfChecks");
    await openSection(page, "journal");
    await page.locator(`#journalTable tbody tr[data-source-id="${original.id}"] .journal-issue-btn`).click();
    await page.locator(".journal-issue-card__repeat-action").click();
    await page.locator('#reinforcement[data-inspection-mode="repeat"]').waitFor();
    assert.equal(await actual.inputValue(), "");
    assert.equal(await page.locator("#projDia").inputValue(), "16");
    await actual.fill("16");
    await save();
    const records = await app.records("reinfChecks");
    assert.equal(records.length, 2);
    assert.equal(Number(records.find(record => record.id === original.id).factDia), 18);
    const repeated = records.find(record => record.id !== original.id);
    assert.equal(Number(repeated.factDia), 16);
    await openSection(page, "journal");
    await page.locator(`#journalTable tbody tr[data-source-id="${repeated.id}"]`).waitFor();
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});


test("knowledge catalog keeps filters and keyboard focus on return from an article", { timeout: 60000 }, async () => {
  const app = await startApp({ browserType: selectedBrowser });
  const { page } = app;
  try {
    await openSection(page, "knowledge");
    const cards = page.locator("#knowledgeArticlesGrid .knowledge-article-card");
    await cards.first().waitFor();
    const total = await cards.count();
    await page.locator("#knowledgeModuleFilter").selectOption("geometry");
    assert.ok(await cards.count() > 0 && await cards.count() < total);
    const first = cards.first();
    const title = await first.locator(".knowledge-article-title").textContent();
    await first.press("Enter");
    const article = page.locator("#articleViewTitle");
    await article.waitFor();
    assert.equal(await article.textContent(), title);
    assert.equal(await article.evaluate(element => element === document.activeElement), true);
    await page.locator("#btnBackToArticles").click();
    assert.equal(await page.locator("#knowledgeModuleFilter").inputValue(), "geometry");
    assert.equal(await first.evaluate(element => element === document.activeElement), true);
    await page.setViewportSize({ width: 390, height: 840 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
