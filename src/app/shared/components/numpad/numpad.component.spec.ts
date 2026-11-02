import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NumpadComponent, applyNumpadKey, numpadKeyFromEvent } from './numpad.component';

describe('applyNumpadKey', () => {
  it('replaces a lone zero instead of appending to it', () => {
    expect(applyNumpadKey('0', '5')).toBe('5');
    expect(applyNumpadKey('', '0')).toBe('0');
    expect(applyNumpadKey('0', '0')).toBe('0');
  });
  it('types, deletes and clears', () => {
    expect(['1', '5', '0', '0', '0'].reduce((v, k) => applyNumpadKey(v, k), '')).toBe('15000');
    expect(applyNumpadKey('150', '⌫')).toBe('15');
    expect(applyNumpadKey('150', 'C')).toBe('');
  });
  it('allows one decimal separator when decimals are on', () => {
    expect(applyNumpadKey('', ',', { decimal: true })).toBe('0.');
    expect(applyNumpadKey('2.5', ',', { decimal: true })).toBe('2.5');
    expect(applyNumpadKey('2', ',', { decimal: false })).toBe('2');
    expect(applyNumpadKey('2.125', '7', { decimal: true })).toBe('2.125');
  });
});

describe('numpadKeyFromEvent', () => {
  it('maps physical keys to numpad keys', () => {
    expect(numpadKeyFromEvent('7')).toBe('7');
    expect(numpadKeyFromEvent(',')).toBe(',');
    expect(numpadKeyFromEvent('.')).toBe('.');
    expect(numpadKeyFromEvent('Backspace')).toBe('⌫');
    expect(numpadKeyFromEvent('Delete')).toBe('C');
    expect(numpadKeyFromEvent('a')).toBeNull();
    expect(numpadKeyFromEvent('Shift')).toBeNull();
  });
});

describe('NumpadComponent physical keyboard', () => {
  let now = 1_000_000;

  function setup() {
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const fixture = TestBed.createComponent(NumpadComponent);
    const values: string[] = [];
    let enters = 0;
    fixture.componentInstance.valueChange.subscribe((v) => values.push(v));
    fixture.componentInstance.enter.subscribe(() => enters++);
    fixture.detectChanges();
    return { fixture, values, enters: () => enters };
  }

  /** `gapMs` is the time since the previous key: humans are slow, scanners are not. */
  function press(key: string, gapMs = 200) {
    now += gapMs;
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.querySelectorAll('[data-test-field]').forEach((el) => el.remove());
  });

  it('types digits, deletes, clears and confirms', () => {
    const { values, enters } = setup();
    press('5');
    press('0');
    press('Backspace');
    press('7');
    expect(values).toEqual(['5', '50', '5', '57']);
    press('Delete');
    expect(values.at(-1)).toBe('');
    const enter = press('Enter');
    expect(enter.defaultPrevented).toBe(true);
    expect(enters()).toBe(1);
  });

  it('keeps every key when they arrive before the parent re-renders', () => {
    const { values } = setup();
    press('1');
    press('2');
    press('3');
    expect(values.at(-1)).toBe('123');
  });

  it('leaves keys alone while a field has focus', () => {
    const { values, enters } = setup();
    const field = document.createElement('input');
    field.setAttribute('data-test-field', '');
    document.body.appendChild(field);
    field.focus();
    press('5');
    press('Enter');
    expect(values).toEqual([]);
    expect(enters()).toBe(0);
  });

  it('stays off when the parent handles the keyboard itself', () => {
    const { fixture, values } = setup();
    fixture.componentRef.setInput('keyboard', false);
    fixture.detectChanges();
    press('5');
    expect(values).toEqual([]);
  });

  it('undoes a barcode scan instead of confirming it as an amount', () => {
    const { fixture, values, enters } = setup();
    fixture.componentRef.setInput('value', '100');
    fixture.detectChanges();
    press('4');
    press('7', 5);
    press('8', 5);
    press('0', 5);
    press('Enter', 5);
    expect(values.at(-1)).toBe('100');
    expect(enters()).toBe(0);
  });

  it('lets Enter activate a button reached with Tab', () => {
    const { enters } = setup();
    const button = document.createElement('button');
    button.setAttribute('data-test-field', '');
    document.body.appendChild(button);
    button.focus();
    press('Tab');
    const enter = press('Enter');
    expect(enter.defaultPrevented).toBe(false);
    expect(enters()).toBe(0);

    window.dispatchEvent(new Event('pointerdown'));
    press('Enter');
    expect(enters()).toBe(1);
  });
});
