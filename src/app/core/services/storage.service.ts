import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { FIREBASE_STORAGE } from '../firebase/firebase.providers';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private storage = inject(FIREBASE_STORAGE);

  /** Uploads to categories/{timestamp}-{filename} and resolves the public download URL. */
  uploadCategoryImage(file: File): Observable<string> {
    const path = `categories/${Date.now()}-${file.name}`;
    const fileRef = ref(this.storage, path);
    return from(uploadBytes(fileRef, file).then(() => getDownloadURL(fileRef)));
  }
}
