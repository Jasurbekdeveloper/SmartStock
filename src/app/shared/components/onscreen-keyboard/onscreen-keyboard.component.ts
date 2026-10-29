import { Component, computed, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

const LATIN = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', "o'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', "g'"]
];
const CYRILLIC = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['й', 'ц', 'у', 'к', 'е', 'н', 'г', 'ш', 'ў', 'з', 'х'],
  ['ф', 'қ', 'в', 'а', 'п', 'р', 'о', 'л', 'д', 'ж', 'э'],
  ['я', 'ч', 'с', 'м', 'и', 'т', 'ь', 'б', 'ю', 'ғ', 'ҳ']
];

/** Edits a text with one on-screen key. Pure — unit tested. */
export function applyTextKey(current: string, key: string): string {
  if (key === '⌫') return current.slice(0, -1);
  if (key === 'space') return current.endsWith(' ') || !current ? current : current + ' ';
  return current + key;
}

/**
 * Letter keyboard for touch tills: Uzbek Latin (o', g', sh, ch keys) or Cyrillic.
 * Shown in place of the tablet's own keyboard, which would cover half the screen.
 */
@Component({
  selector: 'app-onscreen-keyboard',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="osk" role="group" aria-label="Keyboard" (mousedown)="$event.preventDefault()">
      @for (row of rows(); track $index; let r = $index) {
      <div class="osk__row" [class.osk__row--inset]="r === 2 && !cyrillic()">
        @if (r === 3) { <button type="button" class="osk__key osk__key--fn" (click)="press('⌫')" aria-label="Backspace"><mat-icon>backspace</mat-icon></button> }
        @for (k of row; track k) {
        <button type="button" class="osk__key" (click)="press(k)">{{ k }}</button>
        }
      </div>
      }
      <div class="osk__row">
        <button type="button" class="osk__key osk__key--fn osk__key--w2" (click)="cyrillic.set(!cyrillic())">{{ cyrillic() ? 'Lotin' : 'Кирилл' }}</button>
        @if (!cyrillic()) {
        <button type="button" class="osk__key osk__key--fn" (click)="press('sh')">sh</button>
        <button type="button" class="osk__key osk__key--fn" (click)="press('ch')">ch</button>
        }
        <button type="button" class="osk__key osk__key--space" (click)="press('space')">{{ spaceLabel() }}</button>
        <button type="button" class="osk__key osk__key--fn osk__key--w2" (click)="closed.emit()">
          <mat-icon>keyboard_hide</mat-icon>
        </button>
        @if (enterLabel()) {
        <button type="button" class="osk__key osk__key--ok" (click)="enter.emit()">{{ enterLabel() }}</button>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .osk { display: flex; flex-direction: column; gap: 0.4rem; padding: 0.5rem; border-radius: 16px; background: var(--surface-3); box-shadow: var(--shadow-lg); user-select: none; }
    .osk__row { display: flex; gap: 0.4rem; }
    .osk__row--inset { padding: 0 1.2rem; }
    .osk__key {
      flex: 1; min-width: 0; height: 3rem; border-radius: 10px; border: 0;
      background: var(--surface); color: var(--text); font: 500 1.15rem var(--font-sans);
      box-shadow: 0 1px 0 var(--border-strong); display: grid; place-items: center; touch-action: manipulation;
    }
    .osk__key:active { background: var(--brand-soft); transform: translateY(1px); }
    .osk__key--fn { flex: 0 0 auto; min-width: 3.4rem; background: var(--surface-2); font-size: 0.9rem; font-weight: 600; }
    .osk__key--w2 { min-width: 5.5rem; }
    .osk__key--space { flex: 4; font-size: 0.85rem; color: var(--text-muted); }
    .osk__key--ok { flex: 0 0 auto; min-width: 8rem; background: var(--brand); color: var(--brand-contrast); font-size: 0.9rem; font-weight: 700; }
  `
})
export class OnscreenKeyboardComponent {
  spaceLabel = input('');
  enterLabel = input('');
  key = output<string>();
  enter = output<void>();
  closed = output<void>();

  cyrillic = signal(false);
  rows = computed(() => (this.cyrillic() ? CYRILLIC : LATIN));

  press(k: string) {
    this.key.emit(k);
  }
}
