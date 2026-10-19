import { PaintDocument } from './canvas/document';
import { View } from './canvas/view';
import { firstImageFile, loadImageFile, UnsupportedImageError } from './io/load';
import { encodeCanvas, exportFileName, saveBlob, type ExportFormat } from './io/save';

export class App {
  readonly view: View;
  doc: PaintDocument | null = null;
  private readonly root: HTMLElement;
  private readonly fileInput: HTMLInputElement;
  private readonly status: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div class="app" data-empty="true">
        <header class="topbar">
          <span class="brand">lamosaic</span>
          <div class="topbar-actions">
            <button type="button" class="btn" data-action="open">画像を開く</button>
            <button type="button" class="btn btn-primary" data-action="save" disabled>保存</button>
          </div>
        </header>
        <main class="stage">
          <canvas class="view" aria-label="編集中の画像"></canvas>
          <div class="empty">
            <p class="empty-title">写真を選んで、顔をおしゃれに隠そう</p>
            <button type="button" class="btn btn-primary btn-large" data-action="open">写真を選ぶ</button>
            <p class="empty-note">ドラッグ＆ドロップや貼り付けでも開けます。<br />写真は端末の外に送信されません。</p>
          </div>
        </main>
        <p class="status" role="status" aria-live="polite"></p>
        <input type="file" accept="image/*" hidden />
      </div>
    `;
    this.view = new View(this.q<HTMLCanvasElement>('canvas.view'));
    this.fileInput = this.q<HTMLInputElement>('input[type=file]');
    this.status = this.q<HTMLElement>('.status');

    root
      .querySelectorAll<HTMLButtonElement>('[data-action=open]')
      .forEach((b) => b.addEventListener('click', () => this.fileInput.click()));
    this.q<HTMLButtonElement>('[data-action=save]').addEventListener('click', () => {
      void this.save('png');
    });
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

  q<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`Missing element: ${selector}`);
    return el;
  }

  async open(file: Blob): Promise<void> {
    this.setStatus('読み込み中…');
    try {
      const canvas = await loadImageFile(file);
      this.doc = new PaintDocument(canvas);
      this.view.setDocument(this.doc);
      this.q<HTMLElement>('.app').dataset.empty = 'false';
      this.q<HTMLButtonElement>('[data-action=save]').disabled = false;
      this.setStatus('');
    } catch (error) {
      console.error(error);
      this.setStatus(
        error instanceof UnsupportedImageError ? error.message : '画像を開けませんでした。',
      );
    }
  }

  async save(format: ExportFormat): Promise<void> {
    if (!this.doc) return;
    try {
      const blob = await encodeCanvas(this.doc.composite(), format);
      const result = await saveBlob(blob, exportFileName(format));
      this.setStatus(result === 'downloaded' ? '保存しました。' : '');
    } catch (error) {
      console.error(error);
      this.setStatus('保存できませんでした。');
    }
  }

  setStatus(message: string): void {
    this.status.textContent = message;
    this.status.hidden = message === '';
  }
}
