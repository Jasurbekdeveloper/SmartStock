import { Component, ElementRef, HostListener, inject, input, linkedSignal, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { createScannerGunDetector } from '../../../core/utils/scanner-input.util';

/** Maps a physical key to the numpad key it stands for, or null if it isn't one. */
export function numpadKeyFromEvent(key: string): string | null {
  if (/^\d$/.test(key) || key === ',' || key === '.') return key;
  if (key === 'Backspace') return '⌫';
  if (key === 'Delete') return 'C';
  return null;
}

/** True when keys belong to the focused element (a field, an open select or a menu). */
export function isKeyboardEntryTarget(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return ['combobox', 'listbox', 'option', 'menuitem'].includes(el.getAttribute('role') ?? '');
}

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
 * The parent owns the value (as typed text) and decides what Enter does. The physical
 * keyboard types into it too, unless focus is in a field that takes the keys itself.
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
  /** Off when the parent already routes the physical keyboard itself (the POS ticket). */
  keyboard = input(true);
  valueChange = output<string>();
  enter = output<void>();

  readonly keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', ','];

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private scanner = createScannerGunDetector();
  /** Follows `value`, but also holds keys typed before the parent's next render. */
  private text = linkedSignal(() => this.value());
  /** Value before the current run of fast keys, restored if the run turns out to be a scan. */
  private beforeBurst = '';
  private tabbed = false;

  press(key: string) {
    const opts = { decimal: this.decimal() };
    const next = key === '00'
      ? applyNumpadKey(applyNumpadKey(this.text(), '0', opts), '0', opts)
      : applyNumpadKey(this.text(), key, opts);
    this.setText(next);
  }

  private setText(next: string) {
    this.text.set(next);
    this.valueChange.emit(next);
  }

  /** A mouse click ends keyboard navigation, so Enter goes back to confirming the amount. */
  @HostListener('window:pointerdown')
  onPointerDown() {
    this.tabbed = false;
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!this.keyboard() || !this.inTopDialog() || isKeyboardEntryTarget(document.activeElement)) return;

    if (event.key === 'Tab') {
      this.tabbed = true;
      return;
    }

    // A barcode scanner types like a keyboard. Its code must not become a payment
    // amount, so keys are applied as usual and undone once the run proves to be a scan.
    const scanned = this.scanner.handleKey(event);
    if (scanned) {
      event.preventDefault();
      this.setText(this.beforeBurst);
      return;
    }
    if (event.key.length === 1 && !this.scanner.wasPartOfBurst()) this.beforeBurst = this.text();
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === 'Enter') {
      // Tabbed onto a button (e.g. Cancel): Enter does that button's own job.
      if (this.tabbed && document.activeElement?.closest('button, a')) return;
      event.preventDefault();
      if (!event.repeat) this.enter.emit();
      return;
    }

    const key = numpadKeyFromEvent(event.key);
    if (!key) return;
    event.preventDefault();
    this.tabbed = false;
    this.press(key);
  }

  /** A dialog stacked above this keypad (e.g. a confirmation) keeps the keys to itself. */
  private inTopDialog(): boolean {
    const dialogs = document.querySelectorAll('mat-dialog-container');
    const top = dialogs[dialogs.length - 1];
    return !top || top.contains(this.host.nativeElement);
  }
}
