export type ExportFormat = 'png' | 'jpeg';

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
};

/**
 * Encodes the canvas. Canvas encoders never write EXIF/GPS metadata, so the exported file only
 * contains pixels.
 */
export function encodeCanvas(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('画像の書き出しに失敗しました。'))),
      MIME[format],
      quality,
    );
  });
}

export function exportFileName(format: ExportFormat, now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `lamosaic-${stamp}.${format === 'jpeg' ? 'jpg' : 'png'}`;
}

/**
 * On iPhone/iPad the share sheet is the only way to put an image into the Photos app, so it is
 * preferred on touch devices. Desktop browsers get a regular download.
 */
export async function saveBlob(blob: Blob, fileName: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], fileName, { type: blob.type });
  const prefersShare = matchMedia('(pointer: coarse)').matches;
  if (prefersShare && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
      // Fall through to a download when sharing is not permitted.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
