import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { Category, CategoryService } from '../../../core/services/category.service';
import { StorageService } from '../../../core/services/storage.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { createPagination } from '../../../core/utils/pagination';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    TranslatePipe,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatPaginatorModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './category-list.component.html',
  styleUrl: './category-list.component.css'
})
export class CategoryListComponent {
  private categoryService = inject(CategoryService);
  private storageService = inject(StorageService);
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });
  pagination = createPagination(this.categories);

  showCreateForm = signal(false);
  submitting = signal(false);
  errorKey = signal<string | null>(null);

  editingId = signal<string | null>(null);
  editName = signal('');
  editImageUrl = signal('');
  editImageUploading = signal(false);
  savingEdit = signal(false);

  createImagePreviewUrl = signal('');
  createImageUploading = signal(false);

  createForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    imageUrl: ['']
  });

  openCreateForm() {
    this.createForm.reset({ name: '', imageUrl: '' });
    this.createImagePreviewUrl.set('');
    this.errorKey.set(null);
    this.showCreateForm.set(true);
  }

  cancelCreate() {
    this.showCreateForm.set(false);
  }

  onCreateFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.createImageUploading.set(true);
    this.storageService.uploadCategoryImage(file).subscribe({
      next: (url) => {
        this.createForm.patchValue({ imageUrl: url });
        this.createImagePreviewUrl.set(url);
        this.createImageUploading.set(false);
      },
      error: (err) => {
        console.error('Category image upload error:', err);
        this.errorKey.set('messages.error');
        this.createImageUploading.set(false);
      }
    });
  }

  onEditFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.editImageUploading.set(true);
    this.storageService.uploadCategoryImage(file).subscribe({
      next: (url) => {
        this.editImageUrl.set(url);
        this.editImageUploading.set(false);
      },
      error: (err) => {
        console.error('Category image upload error:', err);
        this.errorKey.set('messages.error');
        this.editImageUploading.set(false);
      }
    });
  }

  submitCreate() {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);
    const { name, imageUrl } = this.createForm.getRawValue();

    this.categoryService.addCategory({ name, imageUrl: imageUrl.trim() || undefined }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.showCreateForm.set(false);
      },
      error: (err) => {
        console.error('Create category error:', err);
        this.errorKey.set('messages.error');
        this.submitting.set(false);
      }
    });
  }

  startEdit(category: Category) {
    this.editingId.set(category.id);
    this.editName.set(category.name);
    this.editImageUrl.set(category.imageUrl ?? '');
    this.errorKey.set(null);
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  saveEdit(id: string) {
    const name = this.editName().trim();
    if (!name) return;

    this.savingEdit.set(true);
    this.errorKey.set(null);

    this.categoryService.updateCategory(id, { name, imageUrl: this.editImageUrl().trim() || undefined }).subscribe({
      next: () => {
        this.savingEdit.set(false);
        this.editingId.set(null);
      },
      error: (err) => {
        console.error('Update category error:', err);
        this.errorKey.set('messages.error');
        this.savingEdit.set(false);
      }
    });
  }

  requestDelete(category: Category) {
    this.dialog
      .open(ConfirmDialogComponent, {
        data: { titleKey: 'buttons.delete', messageKey: 'categories.confirmDelete' }
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) return;

        this.categoryService.deleteCategory(category.id).subscribe({
          error: (err) => {
            console.error('Delete category error:', err);
            this.errorKey.set('messages.error');
          }
        });
      });
  }
}
