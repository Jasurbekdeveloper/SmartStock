import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NumericInputDirective, groupNumber, rawNumber } from './numeric-input.directive';

describe('rawNumber / groupNumber', () => {
  it('strips grouping and normalises the decimal comma', () => {
    expect(rawNumber('1 500 000')).toBe('1500000');
    expect(rawNumber('1 500,75')).toBe('1500.75');
    expect(rawNumber('12a.3.4')).toBe('12.34');
    expect(rawNumber('-5', false)).toBe('5');
  });
  it('groups thousands', () => {
    expect(groupNumber('1500000')).toBe('1 500 000');
    expect(groupNumber('1500.5')).toBe('1 500.5');
    expect(groupNumber('999')).toBe('999');
    expect(groupNumber('')).toBe('');
  });
});

@Component({
  imports: [FormsModule, NumericInputDirective],
  template: `<input type="number" min="0" [ngModel]="price()" (ngModelChange)="price.set($event)" />`
})
class Host {
  price = signal<number | null>(1500000);
}

describe('NumericInputDirective', () => {
  it('shows grouped digits but gives forms a plain number', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.autoDetectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.get!.call(input)).toBe('1 500 000');
    expect(input.value).toBe('1500000');

    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '25000');
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.price()).toBe(25000);
    expect(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.get!.call(input)).toBe('25 000');
  });
});
