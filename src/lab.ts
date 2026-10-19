import './style.css';
import './lab.css';
import { App } from './app';
import type { BrushParams } from './brush/params';

/**
 * Brush lab: the app plus sliders for every brush parameter, for tuning the presets.
 * The current parameters can be copied as JSON and pasted into presets.ts.
 */
type NumericKey = {
  [K in keyof BrushParams]: BrushParams[K] extends number ? K : never;
}[keyof BrushParams];

const RANGES: Array<[key: NumericKey, min: number, max: number, step: number]> = [
  ['size', 0.01, 0.5, 0.005],
  ['opacity', 0, 1, 0.01],
  ['edgeSoftness', 0, 1, 0.01],
  ['edgeWobble', 0, 0.5, 0.01],
  ['endFeather', 0, 2, 0.01],
  ['startTaper', 0, 2, 0.01],
  ['grain', 0, 2, 0.01],
  ['grainScale', 0.0002, 0.006, 0.0001],
  ['grainContrast', 1, 12, 0.1],
  ['bristle', 0, 1, 0.01],
  ['bristleCount', 2, 80, 1],
  ['mottle', 0, 1, 0.01],
  ['mottleScale', 0.05, 3, 0.01],
  ['underlay', 0, 1, 0.01],
  ['sampleRadius', 0, 2, 0.01],
  ['pickup', 0, 1, 0.01],
  ['lighten', -0.3, 0.4, 0.005],
  ['mute', 0, 1, 0.01],
  ['warmth', -0.03, 0.03, 0.001],
  ['colorJitter', 0, 1, 0.01],
  ['smoothing', 0, 0.95, 0.01],
  ['spacing', 0.02, 0.5, 0.01],
];

const appRoot = document.querySelector<HTMLDivElement>('#app');
const panel = document.querySelector<HTMLElement>('#lab');
if (appRoot && panel) {
  const app = new App(appRoot);
  (window as unknown as { lamosaic: App }).lamosaic = app;

  const rows = RANGES.map(([key, min, max, step]) => {
    const value = app.params[key];
    return `<label class="lab-row"><span>${key}</span>
      <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" />
      <output data-out="${key}">${value}</output></label>`;
  }).join('');
  panel.innerHTML = `
    <h2>Brush lab</h2>
    <label class="lab-row"><span>sampleFrom</span>
      <select data-key="sampleFrom"><option>original</option><option>composite</option></select></label>
    ${rows}
    <div class="lab-actions">
      <button type="button" class="btn" data-lab="copy">JSONをコピー</button>
      <button type="button" class="btn" data-lab="clear">全部消す</button>
    </div>
    <textarea readonly rows="8"></textarea>
  `;
  const textarea = panel.querySelector('textarea') as HTMLTextAreaElement;
  const refresh = () => {
    textarea.value = JSON.stringify(app.params, null, 2);
  };
  panel.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.key as NumericKey;
      app.params[key] = Number(input.value);
      const out = panel.querySelector(`[data-out=${key}]`);
      if (out) out.textContent = input.value;
      refresh();
    });
  });
  const select = panel.querySelector<HTMLSelectElement>('select[data-key=sampleFrom]');
  select?.addEventListener('change', () => {
    app.params.sampleFrom = select.value as BrushParams['sampleFrom'];
    refresh();
  });
  panel.querySelector('[data-lab=copy]')?.addEventListener('click', () => {
    void navigator.clipboard?.writeText(textarea.value);
  });
  panel.querySelector('[data-lab=clear]')?.addEventListener('click', () => {
    while (app.history?.canUndo) app.undo();
  });
  refresh();
}
