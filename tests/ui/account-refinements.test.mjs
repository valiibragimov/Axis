import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { startStaticServer } from '../smoke/helpers/static-server.mjs';

async function fixture(run) {
  const server = await startStaticServer(resolve('dist-demo'));
  const browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'chrome' } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await page.goto(server.url + '/demo.html');
    await page.locator('#overviewReadinessValue').filter({ hasText: '0%' }).waitFor();
    await run(page);
  } finally { await browser.close(); await server.close(); }
}

test('changing theme keeps the account menu open and focused', async () => fixture(async page => {
  assert.equal(await page.locator('header button:not(.brand), header select, .sidebar-caption, .account-chevron').count(), 0);
  const before = await page.locator('body').getAttribute('class');
  await page.locator('#headerProfileButton').click();
  await page.locator('[data-account-theme]').click();
  assert.notEqual(await page.locator('body').getAttribute('class'), before);
  assert.equal(await page.locator('#accountMenu').isVisible(), true);
  assert.equal(await page.locator('[data-account-theme]').evaluate(el => el === document.activeElement), true);
}));

test('selected options have no second decorative checkmark', async () => fixture(async page => {
  const marker = await page.locator('#projectSelector option:checked').evaluate(el => getComputedStyle(el, '::after').content);
  assert.ok(['none', 'normal', '""'].includes(marker), `Extra marker: ${marker}`);
}));


test('links from profile open the requested section rather than the previous tab', async () => fixture(async page => {
  const base = page.url().split('#')[0];
  await page.evaluate(() => localStorage.setItem('active_tab_v1', 'journal'));
  await page.goto(base + '#geometry');
  await page.reload();
  await page.locator('#geometry.active').waitFor();
  assert.equal(await page.locator('body').getAttribute('data-workspace-tab'), 'geometry');
  await page.locator('.tabs [data-target="journal"]').click();
  await page.reload();
  await page.locator('#journal.active').waitFor();
  await page.goto(base + '#unknown-section');
  await page.reload();
  await page.locator('#journal.active').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('active_tab_v1')), 'journal');
}));
