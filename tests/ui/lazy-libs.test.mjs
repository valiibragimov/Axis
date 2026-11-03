import test from "node:test";
import assert from "node:assert/strict";
import { resolve, basename } from "node:path";
import { chromium } from "playwright";
import { startStaticServer } from "../smoke/helpers/static-server.mjs";

for (const nested of [false, true]) {
  test(`lazy libraries load and render with ${nested ? "a nested" : "the root"} application path`, async () => {
    const server = await startStaticServer(resolve(nested ? ".." : "."));
    const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: "chrome" } : {}) });
    const errors = [];
    try {
      const page = await browser.newPage();
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
      await page.route("**/*", route => new URL(route.request().url()).origin === server.url ? route.continue() : route.abort());
      const prefix = nested ? `/${basename(resolve("."))}` : "";
      await page.goto(`${server.url}${prefix}/dist/app/ui/lazy-libs.js`);
      const result = await page.evaluate(async prefix => {
        const libs = await import(`${prefix}/dist/app/ui/lazy-libs.js`);
        const loaded = await Promise.all([libs.ensureChartJsLoaded(), libs.ensureChartJsLoaded(), libs.ensureJsPdfLoaded()]);
        if (loaded.some(value => !value)) return { loaded };
        const canvas = document.createElement("canvas");
        document.body.append(canvas);
        const chart = new window.Chart(canvas, { type: "bar", data: { labels: ["Test"], datasets: [{ data: [1] }] }, options: { animation: false } });
        const pdf = new window.jspdf.jsPDF();
        const result = { loaded, charts: document.querySelectorAll('script[data-lazy-lib="chartjs"]').length, chartPoints: chart.data.datasets[0].data.length, pdf: pdf.output().startsWith("%PDF-") };
        chart.destroy();
        return result;
      }, prefix);
      assert.deepEqual(result, { loaded: [true, true, true], charts: 1, chartPoints: 1, pdf: true });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); await server.close(); }
  });
}
