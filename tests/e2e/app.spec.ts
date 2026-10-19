import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const fixture = new URL('../fixtures/rotated-with-gps.jpg', import.meta.url).pathname;

async function openFixture(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.locator('.app')).toHaveAttribute('data-empty', 'false');
}

test('shows the start screen', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('lamosaic');
  await expect(page.getByRole('button', { name: '写真を選ぶ' })).toBeVisible();
});

test('applies the EXIF orientation when opening a photo', async ({ page }) => {
  await openFixture(page);
  const info = await page.evaluate(() => {
    const doc = (
      window as unknown as {
        lamosaic: { doc: { width: number; height: number; originalPixels: Uint8ClampedArray } };
      }
    ).lamosaic.doc;
    const px = (x: number, y: number) =>
      Array.from(doc.originalPixels.slice((y * doc.width + x) * 4, (y * doc.width + x) * 4 + 3));
    return { width: doc.width, height: doc.height, top: px(100, 10), bottom: px(100, 290) };
  });
  // The fixture is 300x200 (red left, blue right) stored with "rotate 90° clockwise".
  expect(info.width).toBe(200);
  expect(info.height).toBe(300);
  expect(info.top[0]).toBeGreaterThan(150);
  expect(info.bottom[2]).toBeGreaterThan(150);
});

test('saves an image without any metadata', async ({ page }) => {
  await openFixture(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '保存' }).click(),
  ]);
  // A JPEG photo is saved as JPEG.
  expect(download.suggestedFilename()).toMatch(/^lamosaic-\d{8}-\d{6}\.jpg$/);
  const bytes = await readFile(await download.path());
  expect(bytes[0]).toBe(0xff);
  expect(bytes[1]).toBe(0xd8);
  const text = bytes.toString('latin1');
  expect(text).not.toContain('Exif');
  expect(text).not.toContain('TestCamera');
});
