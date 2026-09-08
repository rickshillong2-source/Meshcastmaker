import { chromium } from 'playwright';
import path from 'node:path';

const URL = 'http://127.0.0.1:5183/';
const STL_PATH = path.resolve('scratch/humanoid.stl');

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
  console.log('App loaded.');

  // Import the test humanoid.
  const fileInput = await page.locator('input[type=file]');
  await fileInput.setInputFiles(STL_PATH);
  await page.waitForFunction(() => document.querySelectorAll('canvas').length > 0);
  await page.waitForTimeout(1000);
  const partsHeader = await page.locator('h3', { hasText: 'Parts' }).textContent();
  console.log('After import:', partsHeader);
  await page.screenshot({ path: 'scratch/01-imported.png' });

  // Switch to cut tool and click on the canvas to place a plane.
  await page.getByRole('button', { name: 'Cut', exact: true }).click();
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  console.log('canvas box', box);
  // Click roughly center of the model.
  await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.45 } });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'scratch/02-cut-plane-placed.png' });

  const applyCutVisible = await page.getByRole('button', { name: 'Apply Cut' }).isVisible().catch(() => false);
  console.log('Apply Cut button visible:', applyCutVisible);

  if (applyCutVisible) {
    await page.waitForTimeout(300); // let debounced preview compute
    await page.getByRole('button', { name: 'Apply Cut' }).click();
    await page.waitForTimeout(500);
    const partsHeader2 = await page.locator('h3', { hasText: 'Parts' }).textContent();
    console.log('After cut:', partsHeader2);
    await page.screenshot({ path: 'scratch/03-after-cut.png' });

    const cutDebug = await page.evaluate(() => {
      const s = window.__sceneStore.getState();
      return {
        cuts: Object.fromEntries(Object.entries(s.cuts).map(([id, c]) => [id, { plane: c.plane, partIds: c.partIds }])),
        parts: Object.fromEntries(Object.entries(s.parts).map(([id, p]) => [id, { name: p.name, bbox: p.manifold.boundingBox() }])),
      };
    });
    console.log('cut debug:', JSON.stringify(cutDebug, null, 2));

    // Switch to connector tool.
    await page.getByRole('button', { name: 'Connector', exact: true }).click();
    await page.waitForTimeout(300);
    const cutSelect = page.locator('select').first();
    const options = await cutSelect.locator('option').allTextContents();
    console.log('cut options', options);
    if (options.length > 1) {
      await cutSelect.selectOption({ index: 1 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: 'scratch/04-connector-mode.png' });

      // Click on canvas near center to place a connector on the highlighted cut surface.
      await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.45 } });
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'scratch/05-after-connector.png' });
      const bodyText = await page.locator('body').innerText();
      console.log('connector count text present:', bodyText.includes('connector(s) on this cut'));

      const connectorDebug = await page.evaluate(() => {
        const s = window.__sceneStore.getState();
        return {
          cuts: Object.fromEntries(Object.entries(s.cuts).map(([id, c]) => [id, { connectors: c.connectors, partIds: c.partIds }])),
          parts: Object.fromEntries(Object.entries(s.parts).map(([id, p]) => [id, { name: p.name, bbox: p.manifold.boundingBox(), volume: p.manifold.volume() }])),
        };
      });
      console.log('connector debug:', JSON.stringify(connectorDebug, null, 2));
    }

    // Exploded view.
    const slider = page.locator('input[type=range]');
    await slider.fill('60');
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'scratch/06-exploded.png' });

    // Export all parts.
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await page.getByRole('button', { name: 'Export All Parts' }).click();
    const download = await downloadPromise;
    console.log('download triggered:', !!download, download ? await download.suggestedFilename() : null);
    if (download) {
      await download.saveAs('scratch/parts.zip');
    }
  }

  console.log('\nConsole errors:', consoleErrors.length ? consoleErrors : 'none');

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
