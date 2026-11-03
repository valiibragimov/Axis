import test from 'node:test';
import assert from 'node:assert/strict';
import {startApp} from './helpers/production-app.mjs';

for (const theme of ['light', 'dark']) {
  test(`mobile drawer follows and reverses touch in ${theme} theme`, {timeout:60000}, async()=>{
    const app=await startApp({width:390,theme});
    const {page}=app;
    const session=await page.context().newCDPSession(page);
    const drawer=page.locator('.sidebar-drawer');
    const opener=page.locator('#mobileSidebarToggle');
    const position=()=>page.locator('#workspaceSidebar').boundingBox();
    const start=x=>session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:300}]});
    const move=x=>session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:300}]});
    const end=(cancel=false)=>session.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
    const fullyOpen=()=>page.waitForFunction(()=>{
      const rect=document.getElementById('workspaceSidebar').getBoundingClientRect();
      return document.getElementById('mobileSidebarDrawer').open && rect.width>0 && Math.abs(rect.left)<.5;
    });
    try {
      await page.emulateMedia({reducedMotion:'no-preference'});
      await app.capture(`mobile-opener-${theme}`);
      await opener.focus();await opener.press('Enter');await fullyOpen();
      assert.equal(await drawer.evaluate(e=>e.matches(':modal')),true);
      assert.equal(await opener.getAttribute('aria-expanded'),'true');
      assert.equal(await page.locator('#workspaceSidebar').evaluate(e=>e.contains(document.activeElement)),true);
      await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});
      assert.equal(await opener.evaluate(e=>e===document.activeElement),true);

      await start(8);await move(88);
      const width=(await position()).width;
      assert.ok(Math.abs((await position()).x-(-width+80))<2,'Opening tracks displacement, not an eased target');
      await move(148);assert.ok(Math.abs((await position()).x-(-width+140))<2);
      await move(88);assert.ok(Math.abs((await position()).x-(-width+80))<2,'Reversing the finger reverses the panel immediately');
      // A full-page capture resizes the viewport and correctly cancels a real drag.
      await page.screenshot({path:`output/playwright/main-app/mobile-drag-${theme}.png`,fullPage:false});
      await page.waitForTimeout(120);
      assert.ok(Math.abs((await position()).x-(-width+80))<2,'Holding the finger must not keep animating');
      await end();await drawer.waitFor({state:'hidden'});
      assert.equal(await opener.getAttribute('aria-expanded'),'false');

      await opener.click();await fullyOpen();
      await start(220);await move(140);
      assert.ok(Math.abs((await position()).x+80)<2,'Closing tracks the same pixel distance');
      await end(true);await fullyOpen();
      assert.equal(await opener.getAttribute('aria-expanded'),'true','Cancellation restores the original open state');

      // Grab a programmatic exit mid-flight, then drag it back into view.
      await page.locator('#sidebarToggle').click();
      await page.waitForFunction(()=>{const r=document.getElementById('workspaceSidebar').getBoundingClientRect();return r.left < -4 && r.left > -r.width+4;});
      await start(8);
      const paused=(await position()).x;
      await move(68);
      assert.ok(Math.abs((await position()).x-Math.min(0,paused+60))<3,'A new touch resumes from the visible position');
      await end();await fullyOpen();
      assert.equal(await drawer.evaluate(e=>e.open),true);
      await app.capture(`mobile-open-${theme}`);

      await page.emulateMedia({reducedMotion:'reduce'});
      await start(220);await move(140);
      assert.ok(Math.abs((await position()).x)<1,'Reduced motion uses opacity instead of sliding');
      const opacity=await page.locator('#workspaceSidebar').evaluate(e=>Number(getComputedStyle(e).opacity));
      assert.ok(opacity > .5 && opacity < .9);
      await end(true);
      await page.locator('#sidebarToggle').click();await drawer.waitFor({state:'hidden'});
      assert.equal(await opener.evaluate(e=>e===document.activeElement),true);
      assert.deepEqual(app.errors,[]);
    } finally {
      await end(true).catch(()=>{});await session.detach();await app.close();
    }
  });
}
