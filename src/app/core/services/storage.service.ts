import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { FIREBASE_STORAGE } from '../firebase/firebase.providers';
import { AuthService } from './auth.service';
import { requireTenantId } from './tenant-data';
import { STORED_IMAGE_MAX_BYTES, prepareImageForUpload } from '../utils/image-compress';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private storage = inject(FIREBASE_STORAGE);
  private authService = inject(AuthService);

  /** Uploads to categories/{tenantId}/{uuid}.{ext} and resolves the download URL. */
  uploadCategoryImage(file: File): Observable<string> {
    return from(this.upload('categories', file));
  }

  /** Uploads to products/{tenantId}/{uuid}.{ext} and resolves the download URL. */
  uploadProductImage(file: File): Observable<string> {
    return from(this.upload('products', file));
  }

  private async upload(folder: 'categories' | 'products', file: File): Promise<string> {
    const tenantId = requireTenantId(this.authService);
    const image = await prepareImageForUpload(file);
    if (image.blob.size > STORED_IMAGE_MAX_BYTES) {
      throw Object.assign(new Error('Image too large'), { code: 'image/too-large' });
    }
    // The UUID keeps names unique and ASCII; the original file name is not needed.
    const fileRef = ref(this.storage, `${folder}/${tenantId}/${crypto.randomUUID()}.${image.extension}`);
    await uploadBytes(fileRef, image.blob, {
      contentType: image.contentType,
      cacheControl: 'public, max-age=31536000, immutable'
    });
    return getDownloadURL(fileRef);
  }
}
