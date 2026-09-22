import { chromium } from 'playwright';
import path from 'node:path';

const URL = 'http://127.0.0.1:5183/';
const STL_PATH = path.resolve('scratch/humanoid.stl');
const OBJ_PATH = path.resolve('scratch/humanoid.obj');

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Import STL / OBJ', { timeout: 15000 });

  // --- OBJ import ---
  await page.locator('input[type=file]').setInputFiles(OBJ_PATH);
  await page.waitForTimeout(800);
  console.log('OBJ import - Parts header:', await page.locator('h3', { hasText: 'Parts' }).textContent());

  // --- Undo with nothing done yet should be disabled ---
  console.log('Undo disabled before any cut:', await page.getByRole('button', { name: 'Undo' }).isDisabled());

  // --- First cut ---
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.15 } }); // near head
  await page.waitForTimeout(600);
  const applyVisible1 = await page.getByRole('button', { name: 'Apply Cut' }).isVisible().catch(() => false);
  console.log('Cut 1 - Apply visible:', applyVisible1);
  if (applyVisible1) {
    await page.getByRole('button', { name: 'Apply Cut' }).click();
    await page.waitForTimeout(400);
  }
  console.log('After cut 1:', await page.locator('h3', { hasText: 'Parts' }).textContent());

  // --- Second cut on a different part (select first part in list, then cut) ---
  const firstPartRow = page.locator('[style*="cursor: pointer"]').first();
  await firstPartRow.click();
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.6 } });
  await page.waitForTimeout(600);
  const applyVisible2 = await page.getByRole('button', { name: 'Apply Cut' }).isVisible().catch(() => false);
  console.log('Cut 2 - Apply visible:', applyVisible2);
  if (applyVisible2) {
    await page.getByRole('button', { name: 'Apply Cut' }).click();
    await page.waitForTimeout(400);
  }
  console.log('After cut 2:', await page.locator('h3', { hasText: 'Parts' }).textContent());
  await page.screenshot({ path: 'scratch/10-two-cuts.png' });

  // --- Undo should now be enabled and roll back one cut ---
  console.log('Undo enabled after cuts:', !(await page.getByRole('button', { name: 'Undo' }).isDisabled()));
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(300);
  console.log('After undo:', await page.locator('h3', { hasText: 'Parts' }).textContent());

  // Redo the second cut so we have 3 parts again for the rest of the test.
  await firstPartRow.click();
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.6 } });
  await page.waitForTimeout(600);
  if (await page.getByRole('button', { name: 'Apply Cut' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Apply Cut' }).click();
    await page.waitForTimeout(400);
  }

  // --- Keyed connector on the first available cut ---
  await page.getByRole('button', { name: 'Connector', exact: true }).click();
  await page.waitForTimeout(200);
  const cutSelect = page.locator('select').first();
  const cutOptions = await cutSelect.locator('option').allTextContents();
  console.log('cut options:', cutOptions);
  if (cutOptions.length > 1) {
    await cutSelect.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Keyed peg' }).click();
    await page.waitForTimeout(200);
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.15 } });
    await page.waitForTimeout(500);
    const text = await page.locator('body').innerText();
    console.log('keyed connector added:', text.includes('connector(s) on this cut'));
    await page.screenshot({ path: 'scratch/11-keyed-connector.png' });
  }

  // --- Visibility toggle ---
  const firstCheckbox = page.locator('input[type=checkbox]').first();
  await firstCheckbox.uncheck();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'scratch/12-hidden-part.png' });
  await firstCheckbox.check();

  // --- Per-part STL export button ---
  console.log('Parts before per-part export:', await page.locator('h3', { hasText: 'Parts' }).textContent());
  const stlButtons = page.getByRole('button', { name: 'STL', exact: true });
  console.log('STL buttons found:', await stlButtons.count());
  const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch((e) => { console.log('download wait error:', e.message); return null; });
  await stlButtons.first().click();
  const download = await downloadPromise;
  console.log('per-part STL export triggered:', !!download, download ? await download.suggestedFilename() : null);

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
