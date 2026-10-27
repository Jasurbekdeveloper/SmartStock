import { Component, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Applies one numpad key to the text being typed. Pure — unit tested. */
export function applyNumpadKey(current: string, key: string, opts: { decimal?: boolean; maxLength?: number } = {}): string {
  const max = opts.maxLength ?? 12;
  if (key === 'C') return '';
  if (key === '⌫') return current.slice(0, -1);
  if (key === ',' || key === '.') {
    if (!opts.decimal || current.includes('.')) return current;
    return (current || '0') + '.';
  }
  if (!/^\d+$/.test(key)) return current;
  // A lone "0" is replaced, never prefixed: typing 5 over "0" gives "5", not "05".
  const next = current === '0' ? key.replace(/^0+(?=\d)/, '') || '0' : current + key;
  const [int, frac] = next.split('.');
  if (int.length > max) return current;
  if (frac !== undefined && frac.length > 3) return current;
  return next;
}

/**
 * On-screen number keypad for touch tills: quantity, price, discount, cash received.
 * The parent owns the value (as typed text) and decides what Enter does.
 */
@Component({
  selector: 'app-numpad',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="np" role="group" [attr.aria-label]="label() || 'Numpad'">
      <div class="np__keys">
        @for (k of keys; track k) {
        <button type="button" class="np__key" (click)="press(k)" [disabled]="k === ',' && !decimal()">{{ k }}</button>
        }
      </div>
      <div class="np__side">
        <button type="button" class="np__key np__key--fn" (click)="press('⌫')" aria-label="Backspace"><mat-icon>backspace</mat-icon></button>
        <button type="button" class="np__key np__key--fn np__key--danger" (click)="press('C')">C</button>
        <button type="button" class="np__key np__key--ok" (click)="enter.emit()">{{ okLabel() }}</button>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .np { display: flex; gap: 0.5rem; }
    .np__keys { flex: 1; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; }
    .np__side { width: 30%; max-width: 6.5rem; display: grid; grid-template-rows: 1fr 1fr 2fr; gap: 0.5rem; }
    .np__key {
      min-height: var(--np-key-h, 3.25rem); border-radius: 12px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text); font: 600 1.35rem var(--font-mono);
      display: grid; place-items: center; touch-action: manipulation; user-select: none;
      transition: background-color 0.08s, transform 0.08s;
    }
    .np__key:active { background: var(--surface-3); transform: scale(0.97); }
    .np__key:disabled { opacity: 0.35; }
    .np__key--fn { background: var(--surface-2); font-size: 1.1rem; }
    .np__key--danger { color: var(--danger); }
    .np__key--ok { background: var(--brand); border-color: var(--brand); color: var(--brand-contrast); font: 700 1rem var(--font-sans); }
    .np__key--ok:active { background: var(--brand-strong); }
  `
})
export class NumpadComponent {
  value = input('');
  decimal = input(true);
  okLabel = input('OK');
  label = input('');
  valueChange = output<string>();
  enter = output<void>();

  readonly keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', ','];

  press(key: string) {
    if (key === '00') {
      let v = this.value();
      for (const k of ['0', '0']) v = applyNumpadKey(v, k, { decimal: this.decimal() });
      this.valueChange.emit(v);
      return;
    }
    this.valueChange.emit(applyNumpadKey(this.value(), key, { decimal: this.decimal() }));
  }
}
