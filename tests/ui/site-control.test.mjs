import test from "node:test";
import assert from "node:assert/strict";
import { startApp, openSection } from "./helpers/production-app.mjs";

test("earthwork points persist with frozen rules, reopen, and remain pending without acceptance", { timeout: 90000 }, async () => {
  const app = await startApp();
  try {
    const { page } = app;
    await openSection(page, "geometry");
    await page.locator("#constructionCategory").selectOption("earthworks");
    await page.locator("#constructionType").selectOption("excavation");
    await openSection(page, "geometry");
    const criteria = page.locator("#geometry [data-acceptance]");
    for (const [key, value] of Object.entries({ earthStage: "final", soil: "ordinary", location: "foundation" })) {
      await criteria.locator(`[data-condition="${key}"]`).selectOption(value);
    }
    assert.equal(await criteria.locator('[data-condition="excavationMethod"]').isVisible(), false);
    const panel = page.locator("#geometry [data-site-control]");
    await panel.locator('[data-site-field="drawing"]').fill("Synthetic drawing A, rev 1");
    const point = panel.locator("[data-site-point]").nth(1);
    await point.locator('[data-site-field="label"]').fill("Axis A/1");
    await point.locator('[data-site-field="project"]').fill("10");
    await point.locator('[data-site-field="actual"]').fill("10.05");
    await page.locator("#btnGeom").click();
    await page.locator('#geometry[data-inspection-mode="saved"]').waitFor();
    const saved = (await app.records("geomChecks")).find(record => record.construction === "excavation");
    assert.ok(saved);
    assert.equal(saved.constructionCategory, "earthworks");
    assert.notEqual(saved.status, "ok");
    assert.equal(saved.siteControl.points[1].actual, "10.05");
    assert.equal(saved.siteControl.elevationCriteria.rules.geoHeight.minimumCount, 10);
    assert.deepEqual(saved.siteControl.elevationCriteria.limits.geoHeight, { min: -50, max: 50 });
    assert.match(await page.locator("#geometryResult").innerText(), /готовность основания/u);
    await page.reload();
    await openSection(page, "geometry");
    await page.locator("#geomChecksList .node").filter({ hasText: "Котлован" }).locator(".node-open-button").click();
    assert.equal(await page.locator('#geometry [data-site-point]').nth(1).locator('[data-site-field="actual"]').inputValue(), "10.05");
    for (const theme of ["dark", "light"]) {
      await page.evaluate(async value => {
        const { toggleTheme } = await import("/dist/app/ui/theme.js");
        if (!document.documentElement.classList.contains("theme-" + value)) toggleTheme();
      }, theme);
      assert.equal(await page.locator("html").evaluate((element, value) => element.classList.contains("theme-" + value), theme), true);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#geometry [data-wizard-step="2"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await app.capture(`earthwork-${theme}-390`);
    }
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});

test("concrete preparation saves multiple thicknesses without adopting foundation tolerances", { timeout: 60000 }, async () => {
  const app = await startApp();
  try {
    const { page } = app;
    await openSection(page, "geometry");
    await page.locator("#constructionCategory").selectOption("foundation");
    await page.locator("#constructionType").selectOption("concrete_preparation");
    const panel = page.locator("#geometry [data-site-control]");
    await panel.locator('[data-site-field="drawing"]').fill("Preparation drawing 10, rev 2");
    await panel.getByText("Документы и прочность бетона", { exact: true }).click();
    await panel.locator('[data-site-field="concreteClass"]').fill("B7.5");
    await panel.locator('[data-site-field="preparationApplication"]').selectOption("monolithic_nonrock");
    const point = panel.locator("[data-site-point]").first();
    await point.locator('[data-site-field="label"]').fill("T1");
    await point.locator('[data-site-field="project"]').fill("100");
    await point.locator('[data-site-field="actual"]').fill("101");
    await page.locator("#btnAddSitePoint").click();
    const second = panel.locator("[data-site-point]").last();
    await second.locator('[data-site-field="parameter"]').selectOption("thickness");
    await second.locator('[data-site-field="label"]').fill("T2");
    await second.locator('[data-site-field="project"]').fill("100");
    await second.locator('[data-site-field="actual"]').fill("102");
    await page.locator("#btnGeom").click();
    await page.locator('#geometry[data-inspection-mode="saved"]').waitFor();
    const saved = (await app.records("geomChecks")).find(record => record.construction === "concrete_preparation");
    assert.ok(saved);
    assert.notEqual(saved.status, "ok");
    assert.deepEqual(saved.siteControl.points.filter(p => p.parameter === "thickness").map(p => p.actual), ["101", "102"]);
    assert.equal(saved.acceptanceCriteria.rules.thickness, undefined);
    assert.equal(saved.siteControl.fields.concreteClass, "B7.5");
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
