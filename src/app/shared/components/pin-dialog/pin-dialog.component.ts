import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '../../../core/pipes/translate.pipe';
import { ApprovalPinService, Approver } from '../../../core/services/approval-pin.service';
import { isValidPin } from '../../../core/utils/pin-hash';

export interface PinDialogData {
  /** 'verify': a manager approves something at the till; 'set': the user sets their own PIN. */
  mode: 'verify' | 'set';
  /** Shown under the title (what is being approved). */
  reason?: string;
}

/** Closes with the Approver (verify), true (set) or undefined (cancelled). */
@Component({
  selector: 'app-pin-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ (data.mode === 'set' ? 'pin.setTitle' : 'pin.verifyTitle') | translate }}</h2>
    <mat-dialog-content>
      @if (data.reason) { <p class="mb-3 text-sm">{{ data.reason }}</p> }
      <p class="mb-3 text-sm text-muted">{{ (data.mode === 'set' ? 'pin.setHint' : 'pin.verifyHint') | translate }}</p>
      <input
        class="pin-input"
        type="password"
        inputmode="numeric"
        autocomplete="off"
        maxlength="8"
        [placeholder]="'pin.placeholder' | translate"
        [value]="pin()"
        (input)="pin.set($any($event.target).value); error.set('')"
        (keydown.enter)="submit()"
        cdkFocusInitial
      />
      @if (data.mode === 'set') {
      <input
        class="pin-input mt-2"
        type="password"
        inputmode="numeric"
        autocomplete="off"
        maxlength="8"
        [placeholder]="'pin.repeat' | translate"
        [value]="repeat()"
        (input)="repeat.set($any($event.target).value); error.set('')"
        (keydown.enter)="submit()"
      />
      }
      @if (error()) { <p class="mt-2 text-sm text-loss">{{ error() | translate }}</p> }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (data.mode === 'set') {
      <button mat-button type="button" class="!mr-auto" (click)="remove()">{{ 'pin.remove' | translate }}</button>
      }
      <button mat-button type="button" (click)="ref.close()">{{ 'common.cancel' | translate }}</button>
      <button mat-flat-button color="primary" type="button" [disabled]="busy()" (click)="submit()">
        {{ (data.mode === 'set' ? 'common.save' : 'common.confirmAction') | translate }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `.pin-input { width: 100%; height: 3rem; padding: 0 0.9rem; font-size: 1.4rem; letter-spacing: 0.4em; text-align: center;
       border-radius: 12px; border: 1px solid var(--border-strong); background: var(--surface); color: var(--text); outline: none; }
     .pin-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-ring); }`
  ]
})
export class PinDialogComponent {
  ref = inject(MatDialogRef<PinDialogComponent, Approver | true>);
  data = inject<PinDialogData>(MAT_DIALOG_DATA);
  private pins = inject(ApprovalPinService);

  pin = signal('');
  repeat = signal('');
  error = signal('');
  busy = signal(false);

  async submit() {
    const pin = this.pin().trim();
    if (!isValidPin(pin)) {
      this.error.set('pin.invalid');
      return;
    }
    if (this.data.mode === 'set' && pin !== this.repeat().trim()) {
      this.error.set('pin.mismatch');
      return;
    }
    this.busy.set(true);
    try {
      if (this.data.mode === 'set') {
        await this.pins.setPin(pin);
        this.ref.close(true);
      } else {
        const approver = await this.pins.verify(pin);
        if (approver) this.ref.close(approver);
        else this.error.set('pin.wrong');
      }
    } catch (err) {
      console.error('PIN error:', err);
      this.error.set('messages.error');
    } finally {
      this.busy.set(false);
    }
  }

  async remove() {
    this.busy.set(true);
    try {
      await this.pins.removePin();
      this.ref.close(true);
    } catch {
      this.error.set('messages.error');
    } finally {
      this.busy.set(false);
    }
  }
}
