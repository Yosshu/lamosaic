import { expect, test, type Page } from '@playwright/test';

const fixture = new URL('../fixtures/rotated-with-gps.jpg', import.meta.url).pathname;

async function openFixture(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.locator('.app')).toHaveAttribute('data-empty', 'false');
}

/** Sum of the paint layer's alpha channel. */
function paintedAlpha(page: Page) {
  return page.evaluate(() => {
    const paint = (window as unknown as { lamosaic: { doc: { paint: Uint8ClampedArray } } })
      .lamosaic.doc.paint;
    let sum = 0;
    for (let i = 3; i < paint.length; i += 4) sum += paint[i] as number;
    return sum;
  });
}

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await page.locator('canvas.view').boundingBox();
  if (!box) throw new Error('no canvas');
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx + from[0], cy + from[1]);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    await page.mouse.move(
      cx + from[0] + (to[0] - from[0]) * t,
      cy + from[1] + (to[1] - from[1]) * t,
    );
  }
  await page.mouse.up();
}

test('paints a stroke and undoes/redoes it', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'mouse drag');
  await openFixture(page);
  expect(await paintedAlpha(page)).toBe(0);

  await drag(page, [-60, -40], [60, 40]);
  const afterStroke = await paintedAlpha(page);
  expect(afterStroke).toBeGreaterThan(0);

  await page.getByRole('button', { name: '取り消し' }).click();
  expect(await paintedAlpha(page)).toBe(0);

  await page.getByRole('button', { name: 'やり直し' }).click();
  expect(await paintedAlpha(page)).toBe(afterStroke);
});
