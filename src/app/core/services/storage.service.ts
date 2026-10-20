import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { FIREBASE_STORAGE } from '../firebase/firebase.providers';
import { AuthService } from './auth.service';
import { requireTenantId } from './tenant-data';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private storage = inject(FIREBASE_STORAGE);
  private authService = inject(AuthService);

  /** Uploads to categories/{timestamp}-{filename} and resolves the public download URL. */
  uploadCategoryImage(file: File): Observable<string> {
    const path = `categories/${requireTenantId(this.authService)}/${crypto.randomUUID()}-${file.name}`;
    const fileRef = ref(this.storage, path);
    return from(uploadBytes(fileRef, file).then(() => getDownloadURL(fileRef)));
  }

  uploadProductImage(file: File): Observable<string> {
    const path = `products/${requireTenantId(this.authService)}/${crypto.randomUUID()}-${file.name}`;
    const fileRef = ref(this.storage, path);
    return from(uploadBytes(fileRef, file).then(() => getDownloadURL(fileRef)));
  }
}
