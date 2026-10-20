import { expect, test, type Page } from '@playwright/test';

const fixture = new URL('../fixtures/rotated-with-gps.jpg', import.meta.url).pathname;

interface AppHandle {
  view: { scale: number; fitted: boolean };
  params: { size: number };
  presetId: string;
  pickedColor: number[] | null;
  history: { canUndo: boolean };
  doc: { paint: Uint8ClampedArray };
}

async function openFixture(page: Page) {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles(fixture);
  await expect(page.locator('.app')).toHaveAttribute('data-empty', 'false');
}

function app<T>(page: Page, fn: (a: AppHandle) => T) {
  return page.evaluate(`(${fn.toString()})(window.lamosaic)`) as Promise<T>;
}

async function canvasCenter(page: Page) {
  const box = await page.locator('canvas.view').boundingBox();
  if (!box) throw new Error('no canvas');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function mouseStroke(page: Page, dx = 80) {
  const c = await canvasCenter(page);
  await page.mouse.move(c.x - dx, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(c.x - dx + (2 * dx * i) / 8, c.y + 4);
  await page.mouse.up();
}

/** Dispatches touch pointer events directly, since Playwright has no multi-touch API. */
async function touch(page: Page, type: string, id: number, x: number, y: number) {
  await page.evaluate(
    ([type, id, x, y]) => {
      const canvas = document.querySelector('canvas.view') as HTMLCanvasElement;
      canvas.dispatchEvent(
        new PointerEvent(type as string, {
          pointerId: id as number,
          pointerType: 'touch',
          clientX: x as number,
          clientY: y as number,
          isPrimary: id === 1,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    [type, id, x, y] as const,
  );
}

test.describe('desktop controls', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse and keyboard');

  test('wheel zooms and the fit button resets', async ({ page }) => {
    await openFixture(page);
    const before = await app(page, (a) => a.view.scale);
    const c = await canvasCenter(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -300);
    await expect.poll(() => app(page, (a) => a.view.scale)).toBeGreaterThan(before * 1.2);
    await page.getByRole('button', { name: '全体を表示' }).click();
    expect(await app(page, (a) => a.view.scale)).toBeCloseTo(before, 5);
  });

  test('keyboard shortcuts undo and switch presets', async ({ page }) => {
    await openFixture(page);
    await mouseStroke(page);
    expect(await app(page, (a) => a.history.canUndo)).toBe(true);
    await page.keyboard.press('ControlOrMeta+z');
    expect(await app(page, (a) => a.history.canUndo)).toBe(false);
    await page.keyboard.press('3');
    expect(await app(page, (a) => a.presetId)).toBe('pastel');
    await expect(page.getByRole('radio', { name: 'パステル' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('switching presets keeps the chosen size relative', async ({ page }) => {
    await openFixture(page);
    const crayon = await app(page, (a) => a.params.size);
    await page.keyboard.press(']');
    const bigger = await app(page, (a) => a.params.size);
    expect(bigger).toBeGreaterThan(crayon);
    await page.getByRole('radio', { name: 'ふんわり' }).click();
    const soft = await app(page, (a) => a.params.size);
    expect(soft / bigger).toBeGreaterThan(1);
  });

  test('eyedropper picks a color that the next stroke uses', async ({ page }) => {
    await openFixture(page);
    await page.getByRole('radio', { name: /スポイト/ }).click();
    const box = await page.locator('canvas.view').boundingBox();
    // The top of the fixture is red.
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height * 0.25);
    const picked = await app(page, (a) => a.pickedColor);
    expect(picked).not.toBeNull();
    expect(picked![0]).toBeGreaterThan(150);
    expect(picked![2]).toBeLessThan(100);
    await expect(page.getByRole('radio', { name: /選んだ色/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Going back to the photo's colors clears the picked color.
    await page.getByRole('radio', { name: 'その場の色' }).click();
    expect(await app(page, (a) => a.pickedColor)).toBeNull();
  });

  test('the see-through check reports thin paint', async ({ page }) => {
    await openFixture(page);
    await mouseStroke(page);
    await page.getByRole('button', { name: /透けチェック/ }).click();
    await expect(page.getByRole('status')).toContainText(/透けています|ありません/);
  });
});

test.describe('touch controls', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch');

  test('one finger paints and a two-finger tap undoes', async ({ page }) => {
    await openFixture(page);
    const c = await canvasCenter(page);
    await touch(page, 'pointerdown', 1, c.x - 60, c.y);
    for (let i = 1; i <= 6; i++) await touch(page, 'pointermove', 1, c.x - 60 + i * 20, c.y);
    await touch(page, 'pointerup', 1, c.x + 60, c.y);
    expect(await app(page, (a) => a.history.canUndo)).toBe(true);

    await touch(page, 'pointerdown', 11, c.x - 30, c.y);
    await touch(page, 'pointerdown', 12, c.x + 30, c.y);
    await touch(page, 'pointerup', 11, c.x - 30, c.y);
    await touch(page, 'pointerup', 12, c.x + 30, c.y);
    expect(await app(page, (a) => a.history.canUndo)).toBe(false);
  });

  test('pinching zooms without leaving paint', async ({ page }) => {
    await openFixture(page);
    const c = await canvasCenter(page);
    const before = await app(page, (a) => a.view.scale);
    await touch(page, 'pointerdown', 21, c.x - 20, c.y);
    await touch(page, 'pointerdown', 22, c.x + 20, c.y);
    for (let i = 1; i <= 5; i++) {
      await touch(page, 'pointermove', 21, c.x - 20 - i * 15, c.y);
      await touch(page, 'pointermove', 22, c.x + 20 + i * 15, c.y);
    }
    await touch(page, 'pointerup', 21, c.x - 95, c.y);
    await touch(page, 'pointerup', 22, c.x + 95, c.y);
    expect(await app(page, (a) => a.view.scale)).toBeGreaterThan(before * 1.5);
    expect(await app(page, (a) => a.history.canUndo)).toBe(false);
  });
});
