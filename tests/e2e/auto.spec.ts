import { expect, test, type Page } from '@playwright/test';

const fixture = new URL('../fixtures/rotated-with-gps.jpg', import.meta.url).pathname;

async function openFixture(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.locator('.app')).toHaveAttribute('data-empty', 'false');
}

test('auto cover paints planned strokes as one undo step', async ({ page }) => {
  await openFixture(page);
  const result = await page.evaluate(() => {
    const app = (window as unknown as { lamosaic: any }).lamosaic; // eslint-disable-line @typescript-eslint/no-explicit-any
    app.paintFaces(
      [{ box: { x: 50, y: 80, width: 100, height: 120 }, landmarks: null }],
      'face',
      3,
    );
    let sum = 0;
    for (let i = 3; i < app.doc.paint.length; i += 4) sum += app.doc.paint[i];
    const painted = sum;
    app.undo();
    sum = 0;
    for (let i = 3; i < app.doc.paint.length; i += 4) sum += app.doc.paint[i];
    return { painted, afterUndo: sum, canUndo: app.history.canUndo };
  });
  expect(result.painted).toBeGreaterThan(0);
  expect(result.afterUndo).toBe(0);
  expect(result.canUndo).toBe(false);
});

test('the face detector loads and reports when there is no face', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one browser is enough');
  test.setTimeout(60_000);
  await openFixture(page);
  await page.getByRole('button', { name: '目元' }).click();
  await expect(page.getByRole('status')).toContainText('顔が見つかりませんでした', {
    timeout: 45_000,
  });
});
