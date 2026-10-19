import type { RGB } from './brush/color';
import { BrushEngine } from './brush/engine';
import type { BrushParams } from './brush/params';
import { presetById, PRESETS, type PresetId } from './brush/presets';
import { findThinPaint } from './canvas/coverage';
import { PaintDocument } from './canvas/document';
import { History } from './canvas/history';
import { union, type Rect } from './canvas/rect';
import { View, type Point } from './canvas/view';
import { firstImageFile, loadImageFile, UnsupportedImageError } from './io/load';
import { encodeCanvas, exportFileName, saveBlob, type ExportFormat } from './io/save';
import { PaintController } from './input/paintController';
import { InputRouter } from './input/router';
import { renderPresetPreview } from './ui/presetPreview';

type SliderKey = 'size' | 'opacity' | 'grain' | 'mute' | 'lighten';

interface SliderSpec {
  key: SliderKey;
  label: string;
  /** Maps the 0..100 slider position to the parameter value and back. */
  toValue(position: number): number;
  toPosition(value: number): number;
}

const MIN_SIZE = 0.015;
const MAX_SIZE = 0.45;

function linear(min: number, max: number) {
  return {
    toValue: (p: number) => min + ((max - min) * p) / 100,
    toPosition: (v: number) => ((v - min) / (max - min)) * 100,
  };
}

const SLIDERS: SliderSpec[] = [
  {
    key: 'size',
    label: 'サイズ',
    toValue: (p) => MIN_SIZE * (MAX_SIZE / MIN_SIZE) ** (p / 100),
    toPosition: (v) => (Math.log(v / MIN_SIZE) / Math.log(MAX_SIZE / MIN_SIZE)) * 100,
  },
  { key: 'opacity', label: '濃さ', ...linear(0.2, 1) },
  { key: 'grain', label: '粒', ...linear(0, 1.6) },
  { key: 'mute', label: 'くすみ', ...linear(0, 0.8) },
  { key: 'lighten', label: '明るさ', ...linear(-0.15, 0.25) },
];

const ICON = {
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
  redo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6Z"/><path d="m9 12 2 2 4-4"/></svg>',
};

export class App {
  readonly view: View;
  readonly painter: PaintController;
  readonly router: InputRouter;
  doc: PaintDocument | null = null;
  engine: BrushEngine | null = null;
  history: History | null = null;
  presetId: PresetId = 'crayon';
  params: BrushParams = { ...presetById('crayon').params };
  straight = false;
  /** Color chosen with the eyedropper; null picks the color under each stroke. */
  pickedColor: RGB | null = null;
  private picking = false;
  private checking = false;
  private thinOverlay: HTMLCanvasElement | null = null;
  private sourceFormat: ExportFormat = 'jpeg';
  private readonly root: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly status: HTMLElement;
  private statusTimer = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = this.template();
    this.view = new View(this.q<HTMLCanvasElement>('canvas.view'));
    this.fileInput = this.q<HTMLInputElement>('input[type=file]');
    this.status = this.q<HTMLElement>('.status');

    this.painter = new PaintController({
      view: this.view,
      engine: () => this.engine,
      params: () => this.params,
      straight: () => this.straight,
      color: () => this.pickedColor,
      strokeEnded: (record) => {
        this.history?.push(record);
        this.afterPaintChange();
      },
      flush: () => this.flushEngine(),
    });
    this.router = new InputRouter({
      view: this.view,
      painter: this.painter,
      hasDocument: () => this.doc !== null,
      undo: () => this.undo(),
      picking: () => this.picking,
      pick: (p) => this.pickAt(p),
    });
    this.view.addOverlay((ctx, view) => this.drawOverlays(ctx, view));

    this.bindTopbar();
    this.bindTools();
    this.bindFileInputs();
    this.bindKeyboard();
    this.syncTools();
    this.renderPreviews();
  }

  private template(): string {
    const presets = PRESETS.map(
      (p) => `
        <button type="button" class="preset" role="radio" data-preset="${p.id}" aria-checked="false">
          <span class="preset-thumb"></span>
          <span class="preset-label">${p.label}</span>
        </button>`,
    ).join('');
    const sliders = SLIDERS.map(
      (s) => `
        <label class="slider">
          <span class="slider-label">${s.label}</span>
          <input type="range" min="0" max="100" step="0.5" data-slider="${s.key}" />
        </label>`,
    ).join('');
    return `
      <div class="app" data-empty="true">
        <header class="topbar">
          <span class="brand">lamosaic</span>
          <div class="topbar-actions">
            <button type="button" class="btn btn-icon" data-action="undo" aria-label="取り消し" title="取り消し (⌘/Ctrl+Z)" disabled>${ICON.undo}</button>
            <button type="button" class="btn btn-icon" data-action="redo" aria-label="やり直し" title="やり直し (⇧+⌘/Ctrl+Z)" disabled>${ICON.redo}</button>
            <button type="button" class="btn" data-action="open">開く</button>
            <button type="button" class="btn btn-primary" data-action="save" disabled>保存</button>
          </div>
        </header>
        <main class="stage">
          <canvas class="view" aria-label="編集中の画像"></canvas>
          <div class="stage-tools">
            <button type="button" class="chip" data-action="fit" aria-label="全体を表示" title="全体を表示 (0)">${ICON.fit}</button>
            <button type="button" class="chip" data-action="compare" aria-label="元の写真と比べる（押している間）" title="押している間、元の写真を表示">${ICON.eye}<span>比較</span></button>
            <button type="button" class="chip" data-action="check" aria-pressed="false" title="重ね塗りが足りず透けている所を表示 (C)">${ICON.check}<span>透けチェック</span></button>
          </div>
          <div class="empty">
            <p class="empty-title">写真を選んで、顔をおしゃれに隠そう</p>
            <button type="button" class="btn btn-primary btn-large" data-action="open">写真を選ぶ</button>
            <p class="empty-note">ドラッグ＆ドロップや貼り付けでも開けます。<br />写真は端末の外に送信されません。</p>
          </div>
          <p class="status" role="status" aria-live="polite" hidden></p>
        </main>
        <section class="tools" aria-label="ブラシ">
          <div class="presets" role="radiogroup" aria-label="ブラシの種類">${presets}</div>
          <div class="sliders">${sliders}</div>
          <div class="modes">
            <button type="button" class="toggle" data-action="straight" aria-pressed="false" title="始点から指先までまっすぐ塗る (L)">直線</button>
            <button type="button" class="toggle" data-action="picker" aria-pressed="false" title="写真から色を選ぶ (I)">
              <span class="swatch" aria-hidden="true"></span><span class="picker-label">スポイト</span>
            </button>
            <button type="button" class="toggle" data-action="auto-color" hidden>自動の色に戻す</button>
          </div>
          <p class="hint"></p>
        </section>
        <input type="file" accept="image/*" hidden />
      </div>
    `;
  }

  q<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  }

  private bindTopbar(): void {
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-action=open]')
      .forEach((b) => b.addEventListener('click', () => this.fileInput.click()));
    this.q('[data-action=save]').addEventListener('click', () => void this.save());
    this.q('[data-action=undo]').addEventListener('click', () => this.undo());
    this.q('[data-action=redo]').addEventListener('click', () => this.redo());
    this.q('[data-action=fit]').addEventListener('click', () => this.view.fit());
    this.q('[data-action=check]').addEventListener('click', () => this.setChecking(!this.checking));

    // Compare: show the original only while the button is held.
    const compare = this.q<HTMLButtonElement>('[data-action=compare]');
    const show = (on: boolean) => {
      this.view.showOriginal = on;
      compare.classList.toggle('active', on);
      this.view.requestRender();
    };
    compare.addEventListener('pointerdown', (e) => {
      compare.setPointerCapture(e.pointerId);
      show(true);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      compare.addEventListener(type, () => show(false));
    }
    compare.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') show(true);
    });
    compare.addEventListener('keyup', () => show(false));
  }

  private bindTools(): void {
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-preset]')
      .forEach((b) =>
        b.addEventListener('click', () => this.setPreset(b.dataset.preset as PresetId)),
      );
    for (const spec of SLIDERS) {
      const input = this.q<HTMLInputElement>(`[data-slider=${spec.key}]`);
      input.addEventListener('input', () => {
        this.params[spec.key] = spec.toValue(Number(input.value));
      });
    }
    this.q('[data-action=straight]').addEventListener('click', () => {
      this.straight = !this.straight;
      this.syncTools();
    });
    this.q('[data-action=picker]').addEventListener('click', () => this.setPicking(!this.picking));
    this.q('[data-action=auto-color]').addEventListener('click', () => {
      this.pickedColor = null;
      this.setPicking(false);
    });
  }

  private bindFileInputs(): void {
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) void this.open(file);
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = firstImageFile(e.dataTransfer);
      if (file) void this.open(file);
    });
    window.addEventListener('paste', (e) => {
      const file = firstImageFile(e.clipboardData);
      if (file) void this.open(file);
    });
  }

  private bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        this.redo();
      } else if (mod && key === 's') {
        e.preventDefault();
        void this.save();
      } else if (mod && key === 'o') {
        e.preventDefault();
        this.fileInput.click();
      } else if (!mod && !e.altKey) {
        if (key === '[' || key === ']') {
          const factor = key === '[' ? 1 / 1.15 : 1.15;
          this.params.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, this.params.size * factor));
          this.syncTools();
        } else if (key >= '1' && key <= String(PRESETS.length)) {
          const preset = PRESETS[Number(key) - 1];
          if (preset) this.setPreset(preset.id);
        } else if (key === '0') {
          this.view.fit();
        } else if (key === 'l') {
          this.straight = !this.straight;
          this.syncTools();
        } else if (key === 'i') {
          this.setPicking(!this.picking);
        } else if (key === 'c') {
          this.setChecking(!this.checking);
        } else if (key === 'escape' && this.picking) {
          this.setPicking(false);
        }
      }
    });
  }

  async open(file: Blob): Promise<void> {
    this.setStatus('読み込み中…', false);
    try {
      const canvas = await loadImageFile(file);
      this.painter.cancel();
      this.doc = new PaintDocument(canvas);
      this.engine = new BrushEngine(this.doc);
      this.history = new History(this.engine.grid, this.doc.paint);
      this.sourceFormat = file.type === 'image/png' ? 'png' : 'jpeg';
      this.thinOverlay = null;
      this.view.setDocument(this.doc);
      this.q<HTMLElement>('.app').dataset.empty = 'false';
      this.q<HTMLButtonElement>('[data-action=save]').disabled = false;
      this.afterPaintChange();
      this.setStatus('');
    } catch (error) {
      console.error(error);
      this.setStatus(
        error instanceof UnsupportedImageError ? error.message : '画像を開けませんでした。',
      );
    }
  }

  /** Saves in the format of the opened photo (PNG stays PNG, everything else becomes JPEG). */
  async save(format: ExportFormat = this.sourceFormat): Promise<void> {
    if (!this.doc) return;
    this.flushEngine();
    try {
      const blob = await encodeCanvas(this.doc.composite(), format);
      const result = await saveBlob(blob, exportFileName(format));
      if (result === 'downloaded') this.setStatus('保存しました');
    } catch (error) {
      console.error(error);
      this.setStatus('保存できませんでした。');
    }
  }

  /** Switches the brush to a preset, keeping the size the user picked relative to the preset. */
  setPreset(id: PresetId): void {
    const before = presetById(this.presetId).params.size;
    const scale = this.params.size / before;
    this.presetId = id;
    this.params = { ...presetById(id).params };
    this.params.size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, this.params.size * scale));
    this.syncTools();
  }

  undo(): void {
    if (this.painter.painting) return;
    this.applyTiles(this.history?.undo() ?? null);
  }

  redo(): void {
    if (this.painter.painting) return;
    this.applyTiles(this.history?.redo() ?? null);
  }

  private setPicking(on: boolean): void {
    this.picking = on && this.doc !== null;
    this.syncTools();
  }

  private pickAt(p: Point): void {
    if (!this.engine) return;
    const radius = Math.max(2, this.engine.widthFor(this.params) * 0.08);
    this.pickedColor = this.engine.sampleColor(p.x, p.y, radius, {
      ...this.params,
      sampleFrom: 'composite',
    });
    this.setPicking(false);
  }

  private setChecking(on: boolean): void {
    this.checking = on;
    this.updateThinOverlay();
    this.syncTools();
    if (on && this.doc) {
      this.setStatus(
        this.thinOverlay
          ? 'ピンクの所はまだ透けています。重ね塗りしましょう'
          : '透けている所はありません',
      );
    }
  }

  private applyTiles(tiles: number[] | null): void {
    if (!tiles || !this.doc || !this.engine) return;
    let region: Rect | null = null;
    for (const index of tiles) region = union(region, this.engine.grid.tileRect(index));
    if (region) this.doc.flush(region);
    this.afterPaintChange();
  }

  private afterPaintChange(): void {
    this.updateThinOverlay();
    this.view.requestRender();
    this.q<HTMLButtonElement>('[data-action=undo]').disabled = !this.history?.canUndo;
    this.q<HTMLButtonElement>('[data-action=redo]').disabled = !this.history?.canRedo;
  }

  private updateThinOverlay(): void {
    this.thinOverlay = null;
    if (!this.checking || !this.doc) {
      this.view.requestRender();
      return;
    }
    const map = findThinPaint(this.doc.paint, this.doc.width, this.doc.height);
    if (map.count > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = map.cols;
      canvas.height = map.rows;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const image = ctx.createImageData(map.cols, map.rows);
        for (let i = 0; i < map.values.length; i++) {
          const v = map.values[i] as number;
          if (v === 0) continue;
          image.data.set([255, 40, 150, Math.round(v * 0.8)], i * 4);
        }
        ctx.putImageData(image, 0, 0);
        this.thinOverlay = canvas;
      }
    }
    this.view.requestRender();
  }

  private drawOverlays(ctx: CanvasRenderingContext2D, view: View): void {
    if (!this.doc) return;
    if (this.thinOverlay && !view.showOriginal) {
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.thinOverlay, 0, 0, this.doc.width, this.doc.height);
      ctx.restore();
    }
    // Brush outline under a mouse or pen.
    const hover = this.router.hover;
    if (hover && this.engine && !this.picking) {
      const p = view.toImage(hover);
      const r = this.engine.widthFor(this.params) / 2;
      ctx.save();
      ctx.lineWidth = 1.5 / view.scale;
      ctx.strokeStyle = 'rgb(0 0 0 / 0.5)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.75 / view.scale;
      ctx.strokeStyle = 'rgb(255 255 255 / 0.9)';
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Pushes pending paint to the screen. */
  flushEngine(): void {
    const dirty = this.engine?.takeDirty();
    if (dirty && this.doc) this.doc.flush(dirty);
    this.view.requestRender();
  }

  private syncTools(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.preset === this.presetId));
    });
    for (const spec of SLIDERS) {
      const input = this.q<HTMLInputElement>(`[data-slider=${spec.key}]`);
      input.value = String(Math.min(100, Math.max(0, spec.toPosition(this.params[spec.key]))));
    }
    this.q('[data-action=straight]').setAttribute('aria-pressed', String(this.straight));
    this.q('[data-action=check]').setAttribute('aria-pressed', String(this.checking));
    const picker = this.q<HTMLButtonElement>('[data-action=picker]');
    picker.setAttribute('aria-pressed', String(this.picking));
    const swatch = this.q<HTMLElement>('.swatch');
    swatch.style.background = this.pickedColor
      ? `rgb(${this.pickedColor.map((c) => Math.round(c)).join(' ')})`
      : '';
    swatch.classList.toggle('auto', !this.pickedColor);
    this.q<HTMLElement>('.picker-label').textContent = this.pickedColor ? '選んだ色' : 'スポイト';
    this.q<HTMLButtonElement>('[data-action=auto-color]').hidden = !this.pickedColor;
    this.q<HTMLElement>('.stage').dataset.picking = String(this.picking);
    this.q<HTMLElement>('.hint').textContent = this.picking
      ? '色を取りたい所をタップしてください'
      : this.pickedColor
        ? '選んだ色で塗ります'
        : '塗り始めた所の色を自動で拾います';
  }

  private renderPreviews(): void {
    // Rendered after the first frame so startup stays quick.
    requestAnimationFrame(() => {
      for (const preset of PRESETS) {
        const thumb = this.root.querySelector<HTMLElement>(
          `[data-preset=${preset.id}] .preset-thumb`,
        );
        if (thumb) thumb.style.backgroundImage = `url(${renderPresetPreview(preset.params)})`;
      }
    });
  }

  setStatus(message: string, autoHide = true): void {
    clearTimeout(this.statusTimer);
    this.status.textContent = message;
    this.status.hidden = message === '';
    if (message && autoHide) {
      this.statusTimer = window.setTimeout(() => {
        this.status.hidden = true;
      }, 2800);
    }
  }
}
