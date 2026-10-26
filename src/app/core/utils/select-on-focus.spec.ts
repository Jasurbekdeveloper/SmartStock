import { afterEach, describe, expect, it } from 'vitest';
import { installSelectOnFocus } from './select-on-focus';

describe('installSelectOnFocus', () => {
  let uninstall: () => void = () => undefined;
  afterEach(() => {
    uninstall();
    document.body.innerHTML = '';
  });

  it('selects the whole value of a number field on focus', () => {
    uninstall = installSelectOnFocus();
    const input = document.createElement('input');
    input.type = 'number';
    input.value = '0';
    document.body.appendChild(input);
    let selected = false;
    input.select = () => (selected = true);
    input.focus();
    expect(selected).toBe(true);
  });

  it('leaves text fields alone', () => {
    uninstall = installSelectOnFocus();
    const input = document.createElement('input');
    input.value = 'Sement';
    document.body.appendChild(input);
    let selected = false;
    input.select = () => (selected = true);
    input.focus();
    expect(selected).toBe(false);
  });
});
