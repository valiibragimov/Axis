import assert from 'node:assert/strict';
export async function changeTheme(page) {
  if (!await page.locator('#accountMenu').isVisible()) await page.locator('#headerProfileButton').click();
  await page.locator('[data-account-theme]').click();
  await page.keyboard.press('Escape');
}
export async function changeLanguage(page, language) {
  if (!await page.locator('#accountMenu').isVisible()) await page.locator('#headerProfileButton').click();
  if (await page.locator('html').getAttribute('lang') !== language) await page.locator('[data-account-language]').click();
  await page.waitForFunction(language => document.documentElement.lang === language, language);
  assert.equal(await page.locator('#accountMenu').isVisible(), true);
  await page.keyboard.press('Escape');
}
