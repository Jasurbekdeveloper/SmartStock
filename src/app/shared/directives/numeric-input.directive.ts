import { Directive, ElementRef, OnDestroy, OnInit, inject } from '@angular/core';

const GROUP = ' '; // non-breaking space, so "1 500 000" never wraps

/** "1 500,5" / "1500.5" -> "1500.5" (what code and forms read). */
export function rawNumber(text: string, allowNegative = true): string {
  let s = (text ?? '').replace(/[\s  ]/g, '').replace(/,/g, '.');
  const negative = allowNegative && s.startsWith('-');
  s = s.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
  return (negative ? '-' : '') + s;
}

/** "1500000.5" -> "1 500 000.5" (what the field shows). */
export function groupNumber(raw: string): string {
  if (!raw) return '';
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const [int, frac] = body.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP);
  return (negative ? '-' : '') + grouped + (frac !== undefined ? '.' + frac : '');
}

const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;

/**
 * Every `<input type="number">` in the app: shows amounts with thousands grouped
 * (1 500 000) and ignores the mouse wheel (no accidental price changes). Selecting the
 * value on focus — so typing replaces a "0" — is done app-wide by installSelectOnFocus.
 *
 * The field becomes a text field with a numeric keyboard, but its `value` property
 * still returns the plain number ("1500000"), so ngModel, reactive forms and
 * `(change)="… $event.target.value"` handlers keep working unchanged.
 */
@Directive({
  selector: 'input[type=number]',
  standalone: true,
  host: { inputmode: 'decimal', autocomplete: 'off', 'data-numeric': '' }
})
export class NumericInputDirective implements OnInit, OnDestroy {
  private el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;

  private readonly onInput = () => this.reformat();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = Number(this.el.getAttribute('step')) || 1;
    const current = Number(this.el.value) || 0;
    const min = this.el.getAttribute('min');
    let next = Math.round((current + (e.key === 'ArrowUp' ? step : -step)) * 1000) / 1000;
    if (min !== null && min !== '' && next < Number(min)) next = Number(min);
    this.el.value = String(next);
    this.el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  ngOnInit() {
    const el = this.el;
    const allowNegative = !(el.getAttribute('min') !== null && Number(el.getAttribute('min')) >= 0);
    const initial = nativeValue.get!.call(el);
    el.type = 'text';
    Object.defineProperty(el, 'value', {
      configurable: true,
      get: () => rawNumber(nativeValue.get!.call(el), allowNegative),
      set: (v: unknown) => nativeValue.set!.call(el, groupNumber(rawNumber(v === null || v === undefined ? '' : String(v), allowNegative)))
    });
    if (initial) el.value = initial;
    el.addEventListener('input', this.onInput, true);
    el.addEventListener('keydown', this.onKeyDown);
  }

  ngOnDestroy() {
    this.el.removeEventListener('input', this.onInput, true);
    this.el.removeEventListener('keydown', this.onKeyDown);
  }

  /** Re-groups the text while typing and keeps the caret after the same digit. */
  private reformat() {
    const el = this.el;
    const text = nativeValue.get!.call(el) as string;
    const caret = el.selectionStart ?? text.length;
    const significantBefore = text.slice(0, caret).replace(/[^\d.,-]/g, '').length;
    const formatted = groupNumber(el.value);
    if (formatted === text) return;
    nativeValue.set!.call(el, formatted);
    let pos = 0;
    let seen = 0;
    while (pos < formatted.length && seen < significantBefore) {
      if (/[\d.-]/.test(formatted[pos])) seen++;
      pos++;
    }
    el.setSelectionRange(pos, pos);
  }
}
