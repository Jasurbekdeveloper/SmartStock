/** Longest side of a stored product / category image. POS tiles and lists never show more. */
export const IMAGE_MAX_SIDE = 1024;
/** What storage.rules accept; compressed photos land far below this. */
export const STORED_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export interface PreparedImage {
  blob: Blob;
  contentType: string;
  extension: string;
}

/**
 * Shrinks a phone photo (often 4000px, 5–12 MB) to IMAGE_MAX_SIDE and re-encodes it as
 * WebP (JPEG where WebP encoding is missing). Formats the browser cannot decode (e.g.
 * HEIC on Chrome) and GIF/SVG are returned as they are.
 */
export async function prepareImageForUpload(file: File, maxSide = IMAGE_MAX_SIDE): Promise<PreparedImage> {
  const original: PreparedImage = { blob: file, contentType: file.type || 'image/jpeg', extension: extensionOf(file) };
  if (/image\/(gif|svg)/.test(file.type) || typeof createImageBitmap !== 'function') return original;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return original;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return original;
    ctx.drawImage(bitmap, 0, 0, width, height);

    for (const [type, extension] of [['image/webp', 'webp'], ['image/jpeg', 'jpg']] as const) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
      if (blob && blob.type === type) {
        // Re-encoding a tiny, already-optimised file can make it bigger: keep the smaller one.
        return blob.size < file.size || file.size > STORED_IMAGE_MAX_BYTES ? { blob, contentType: type, extension } : original;
      }
    }
    return original;
  } finally {
    bitmap.close();
  }
}

function extensionOf(file: File): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(file.name)?.[1];
  return (fromName ?? file.type.split('/')[1] ?? 'img').toLowerCase();
}

/** Translation key for a failed upload, by Firebase Storage error code. */
export function imageUploadErrorKey(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') return 'products.imageUploadDenied';
  if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') return 'products.imageUploadNetwork';
  if (code === 'image/too-large') return 'products.imageTooLarge';
  return 'products.imageUploadFailed';
}
