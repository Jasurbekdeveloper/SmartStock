/**
 * App-wide: focusing a number field selects what is in it, so typing replaces the
 * value instead of being appended to it ("0" + "15000" = "015000"). Covers every
 * price, quantity, discount and cash field — POS, stock-in, product forms, dialogs.
 *
 * A mouse click would normally collapse the selection on mouseup, so the mouseup
 * that completes the focusing click is cancelled; later clicks place the caret as usual.
 */
export function installSelectOnFocus(doc: Document = document): () => void {
  let justFocused: HTMLInputElement | null = null;

  const isNumberField = (el: EventTarget | null): el is HTMLInputElement =>
    el instanceof HTMLInputElement && (el.type === 'number' || el.hasAttribute('data-numeric')) && !el.readOnly && !el.disabled;

  const onFocusIn = (event: FocusEvent) => {
    const el = event.target;
    if (!isNumberField(el)) return;
    justFocused = el;
    el.select();
    // Some browsers drop the selection when focus came from a click; select again.
    setTimeout(() => {
      if (doc.activeElement === el) el.select();
    });
  };

  const onMouseUp = (event: MouseEvent) => {
    if (justFocused && event.target === justFocused) event.preventDefault();
    justFocused = null;
  };

  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('mouseup', onMouseUp, true);
  return () => {
    doc.removeEventListener('focusin', onFocusIn);
    doc.removeEventListener('mouseup', onMouseUp, true);
  };
}

/**
 * App-wide: clicking anywhere in a date field opens the calendar, instead of only the
 * small icon at its right edge — picking a date is then one click, typing still works.
 */
export function installDatePickerOnClick(doc: Document = document): () => void {
  const onClick = (event: MouseEvent) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || el.type !== 'date' || el.readOnly || el.disabled) return;
    try {
      (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      /* not allowed in this context (e.g. cross-origin frame) — the icon still works */
    }
  };
  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}
