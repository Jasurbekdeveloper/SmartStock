import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { Category, CategoryService } from '../../../core/services/category.service';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, TranslatePipe, ConfirmDialogComponent],
  templateUrl: './category-list.component.html',
  styleUrl: './category-list.component.css'
})
export class CategoryListComponent {
  private categoryService = inject(CategoryService);
  private fb = inject(FormBuilder);

  categories = toSignal(this.categoryService.getCategories(), { initialValue: [] });

  showCreateForm = signal(false);
  submitting = signal(false);
  errorKey = signal<string | null>(null);

  editingId = signal<string | null>(null);
  editName = signal('');
  savingEdit = signal(false);

  confirmOpen = signal(false);
  private pendingDelete: Category | null = null;

  createForm = this.fb.nonNullable.group({
    name: ['', Validators.required]
  });

  openCreateForm() {
    this.createForm.reset({ name: '' });
    this.errorKey.set(null);
    this.showCreateForm.set(true);
  }

  cancelCreate() {
    this.showCreateForm.set(false);
  }

  submitCreate() {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorKey.set(null);
    const { name } = this.createForm.getRawValue();

    this.categoryService.addCategory(name).subscribe({
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

    this.categoryService.updateCategory(id, name).subscribe({
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
    this.pendingDelete = category;
    this.confirmOpen.set(true);
  }

  confirmDelete() {
    if (!this.pendingDelete) return;
    const id = this.pendingDelete.id;
    this.pendingDelete = null;

    this.categoryService.deleteCategory(id).subscribe({
      error: (err) => {
        console.error('Delete category error:', err);
        this.errorKey.set('messages.error');
      }
    });
  }
}
