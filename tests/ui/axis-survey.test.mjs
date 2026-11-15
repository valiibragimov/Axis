import test from "node:test";
import assert from "node:assert/strict";
import { openSection, startApp } from "./helpers/production-app.mjs";

test("project intersection checks retain the design snapshot and require a fresh repeat survey", { timeout: 90000 }, async () => {
  const app = await startApp();
  const { page } = app;
  try {
    await openSection(page, "geo");
    const mode = page.locator("#geoSurveyMode");
    await mode.selectOption("axis");
    const catalog = page.locator("#geoAxisCatalog");
    await page.getByText("Каталог проектных пересечений объекта", { exact: true }).click();
    await page.getByText("Предел смещения точки по ППГР / РД", { exact: true }).click();
    for (const [name, value] of Object.entries({ label: "А/1", system: "МСК, 0.000", x: "100", y: "200",
      source: "ГП-1, ред. 1", limit: "5", reference: "ППГР, ред. 1, п. 6" })) {
      await catalog.locator(`[name="${name}"]`).fill(value);
    }
    await catalog.getByRole("button", { name: "Сохранить проектное пересечение" }).click();
    await page.getByText("А/1 · X 100 · Y 200 м · МСК, 0.000 · ГП-1, ред. 1", { exact: true }).waitFor();
    assert.equal(await page.locator("#projX").isVisible(), false);
    const survey = page.locator("#geoSurvey");
    const actualX = survey.locator('[name="actual1"]');
    const actualY = survey.locator('[name="actual2"]');
    const evidence = survey.locator('[name="evidence"]');
    const save = async () => {
      await page.locator("#btnGeo").click();
      await page.locator('#geo[data-inspection-mode="saved"]').waitFor();
    };
    await actualX.fill("100.006");
    await actualY.fill("200.008");
    await evidence.fill("Контрольный ход, схема 01");
    await save();
    const [original] = await app.records("geoNodes");
    assert.equal(original.status, "bad");
    assert.ok(Math.abs(original.axisObservation.distance - 10) < 1e-7);
    assert.equal(original.projX, undefined);
    const [point] = await app.records("axisIntersections");
    await app.seed(`projects/project-main/axisIntersections/${point.id}`, { ...point, x: 101 });
    await openSection(page, "journal");
    await page.locator(`#journalTable tr[data-source-id="${original.id}"] .journal-issue-btn`).click();
    await page.locator(".journal-issue-card__repeat-action").click();
    await page.locator('#geo[data-inspection-mode="repeat"]').waitFor();
    assert.equal(await actualX.inputValue(), "");
    assert.equal(await evidence.inputValue(), "");
    await actualX.fill("100.003");
    await actualY.fill("200.004");
    await evidence.fill("Независимый контроль, схема 02");
    await save();
    const repeated = (await app.records("geoNodes")).find(record => record.repeatOf === original.id);
    assert.equal(repeated?.status, "ok");
    assert.equal(repeated.axisObservation.point.x, 100);
    assert.equal((await app.read("geoNodes", original.id)).status, "bad");
    await mode.selectOption("binding");
    assert.equal(await page.locator("#projX").isVisible(), false);
    assert.equal(await survey.locator('[name="project2"]').isVisible(), true);
    await mode.selectOption("height");
    assert.equal(await survey.locator('[name="project2"]').isVisible(), false);
    await survey.locator('#geoSurveyElement [name="label"]').fill("Верх плиты · А/1");
    await survey.locator('[name="project1"]').fill("10");
    await actualX.fill("10.001");
    assert.match(await page.locator("#geoSurveyPreview").innerText(), /H: Δ 1\.00/u);
    assert.deepEqual(app.errors, []);
  } finally { await app.close(); }
});
