import { describe, expect, it } from 'vitest';
import { imageUploadErrorKey, prepareImageForUpload } from './image-compress';

describe('imageUploadErrorKey', () => {
  it('maps Firebase Storage codes to messages', () => {
    expect(imageUploadErrorKey({ code: 'storage/unauthorized' })).toBe('products.imageUploadDenied');
    expect(imageUploadErrorKey({ code: 'storage/retry-limit-exceeded' })).toBe('products.imageUploadNetwork');
    expect(imageUploadErrorKey({ code: 'image/too-large' })).toBe('products.imageTooLarge');
    expect(imageUploadErrorKey(new Error('x'))).toBe('products.imageUploadFailed');
  });
});

describe('prepareImageForUpload', () => {
  it('keeps files the browser cannot decode as they are', async () => {
    const file = new File(['not an image'], 'Rasm 1.HEIC', { type: 'image/heic' });
    const prepared = await prepareImageForUpload(file);
    expect(prepared.blob).toBe(file);
    expect(prepared.extension).toBe('heic');
  });
});
