import test from "node:test";
import assert from "node:assert/strict";
import { startApp, swipe, openSection } from "./helpers/production-app.mjs";

const sections = ["overview", "controlPlan", "journal", "geo", "reinforcement", "geometry", "strength", "summary", "knowledge", "documents"];

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
    const app = await startApp({theme,touch:true});
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
        if (width<=768) {
          assert.equal(await page.locator("#sidebarToggle").isVisible(),false);
          assert.equal(await page.locator("#headerProfileButton").isVisible(),false);
          await swipe(page,{x:8,y:300},{x:180,y:300});
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
          if(width===390) await app.capture(`drawer-${theme}`);
          await swipe(page,{x:220,y:300},{x:40,y:300});
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
    ]) {await swipe(page,from,to,{cancel});assert.equal(await drawer.evaluate(e=>e.open),false);}
    await swipe(page,{x:8,y:300},{x:180,y:300});await drawer.waitFor();
    await page.keyboard.press("Escape");await drawer.waitFor({state:"hidden"});
    const link=page.locator(".sidebar-access-link");await link.focus();await link.press("Enter");await drawer.waitFor();
    await page.keyboard.press("Escape");assert.equal(await link.evaluate(e=>e===document.activeElement),true);
    await page.setViewportSize({width:1440,height:1000});
    await page.locator("#sidebarToggle").click();
    assert.equal(Math.round((await page.locator("#workspaceSidebar").boundingBox()).width),64);
    await page.setViewportSize({width:390,height:480});await swipe(page,{x:8,y:240},{x:180,y:240});
    await page.locator("#headerProfileButton").scrollIntoViewIfNeeded();assert.equal(await page.locator("#headerProfileButton").isVisible(),true);
    await page.setViewportSize({width:1440,height:1000});
    assert.equal(Math.round((await page.locator("#workspaceSidebar").boundingBox()).width),64);
    assert.equal(await drawer.evaluate(e=>e.open),false);
  }finally{await app.close();}
});

test("saved geometry uses real Firestore, keyboard actions and project isolation", {timeout:60000}, async()=>{
  const app=await startApp();const {page}=app;
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
    await page.reload();await openSection(page,"geometry");await page.locator("#geomChecksList .node-open-button").first().click();
    await page.waitForFunction(()=>document.getElementById("factPlateHeight").value==="500");
    await page.locator("#projectSelector").selectOption("project-other");
    await page.waitForFunction(()=>!document.querySelector("#geomChecksList .node"));
    await page.locator("#projectSelector").selectOption("project-main");await page.locator("#geomChecksList .node").waitFor();
  }finally{await app.close();}
});

test("profile and settings use the same mobile drawer and persist a real profile edit", {timeout:60000}, async()=>{
  const app=await startApp({width:390});const{page}=app;
  try {
    for(const path of ["profile","edit-profile"]){
      await page.goto(app.url+`/${path}.html`);await page.locator(".sidebar-drawer").waitFor({state:"attached"});
      await swipe(page,{x:8,y:300},{x:180,y:300});await page.locator(".sidebar-drawer[open]").waitFor();
      assert.equal(await page.locator("#workspaceSidebar #headerProfileButton").isVisible(),true);
      await page.keyboard.press("Escape");assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await app.capture(`${path}-mobile`);
    }
    await page.locator("#profileNameInput").fill("Проверено");
    await page.locator("#saveProfileButton").click();
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
