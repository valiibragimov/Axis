export async function completeSlabAcceptance(page) {
  for (const dimension of ["length", "width"]) {
    for (const side of ["project", "actual"]) await page.locator(`#geometry [data-dimension="${dimension}"][data-side="${side}"]`).fill("6000");
  }
  if (await page.locator("#factPlateFlatness").isVisible()) await page.locator("#factPlateFlatness").fill("0");
  const criteria = page.locator("#geometry [data-acceptance]");
  if (!await criteria.evaluate(element => element.open)) await criteria.locator(":scope > summary").click();
  await criteria.locator('[data-condition="technology"]').selectOption("monolithic");
  await criteria.locator('[data-condition="stage"]').selectOption("completed");
  await criteria.locator('[data-condition="controlComplete"]').selectOption("yes");
  await criteria.locator("details > summary").click();
  for (const key of ["length", "width", "thickness", "flatness"]) {
    await criteria.locator(`[data-limit="${key}"] [data-reference]`).fill("Synthetic drawing / revision 1 / clause 2");
    await criteria.locator(`[data-limit="${key}"] [data-bound="min"]`).fill("-5");
    await criteria.locator(`[data-limit="${key}"] [data-bound="max"]`).fill("5");
    await criteria.locator(`[data-limit="${key}"] [data-confirmed]`).check();
  }
}
