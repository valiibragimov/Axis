import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

test("saved inspections and journal expose independent keyboard actions", async () => {
  const server = await startStaticServer(resolve("dist-demo"));
  const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    await page.goto(server.url + "/demo.html");
    await page.locator("#overviewReadinessValue").filter({ hasText: "0%" }).waitFor();
    for (const target of ["geometry", "reinforcement", "strength"]) {
      await page.locator(`.tabs [data-target="${target}"]`).click();
      const card = page.locator(`#${target} .node`).first();
      await card.waitFor();
      assert.notEqual(await card.getAttribute("role"), "button");
      const open = card.locator(".node-open-button");
      assert.ok((await open.innerText()).trim());
      const before = await page.locator(`#${target} input:visible`).evaluateAll(inputs => inputs.map(input => input.value));
      await card.locator('[data-act="del"]').press("Enter");
      await page.locator(".confirm-popover").waitFor();
      assert.deepEqual(await page.locator(`#${target} input:visible`).evaluateAll(inputs => inputs.map(input => input.value)), before,
        "Delete must open confirmation without loading the saved inspection");
      await page.keyboard.press("Escape");
      assert.equal(await card.isVisible(), true, "Cancel must preserve the inspection");
      await open.press("Enter");
    }
    await page.locator('.tabs [data-target="journal"]').click();
    const row = page.locator("#journalTable tbody tr[data-entry-id]").filter({ hasText: "Геометрия" });
    assert.notEqual(await row.getAttribute("role"), "button");
    await row.locator(".journal-delete-btn").press("Space");
    await page.locator(".confirm-popover").waitFor();
    assert.equal(await page.locator("#journal.active").isVisible(), true);
    await page.keyboard.press("Escape");
    await row.locator(".journal-open-button").press("Enter");
    await page.locator("#geometry.active").waitFor();
    assert.equal(await page.locator("#factPlateHeight").inputValue(), "514");
  } finally {
    await browser.close();
    await server.close();
  }
});
