/**
 * Detects input from a USB/Bluetooth "barcode scanner gun", which behaves like
 * a keyboard that types characters far faster than a human (typically <20ms/char)
 * and terminates the scan with an Enter keypress. Feed every keydown event on
 * a text input through `.handleKey()` — normal human typing is left untouched
 * (returns null), while a detected scan returns the buffered code.
 */
const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'CapsLock']);

export function createScannerGunDetector(maxIntervalMs = 50) {
  let buffer = '';
  let lastKeyTime = 0;
  let lastKeyWasBurstContinuation = false;

  return {
    handleKey(event: KeyboardEvent): string | null {
      const now = Date.now();

      if (event.key === 'Enter') {
        const code = buffer;
        const isFastBurst = code.length >= 4 && now - lastKeyTime <= maxIntervalMs;
        lastKeyWasBurstContinuation = isFastBurst;
        buffer = '';
        return isFastBurst ? code : null;
      }

      // Scanners type capitals with Shift and some send the GS1 group separator as
      // Ctrl+]; modifier presses alone must not break the burst.
      if (MODIFIER_KEYS.has(event.key)) return null;
      let ch = event.key;
      if (event.ctrlKey && (event.key === ']' || event.code === 'BracketRight')) ch = '\u001d';
      else if (event.ctrlKey || event.altKey || event.metaKey) ch = '';
      // Plain EAN/UPC codes are digits; 2D marking codes (Data Matrix) also carry letters
      // and symbols, so any printable character can be part of a scan.
      if (ch.length !== 1) {
        buffer = '';
        lastKeyWasBurstContinuation = false;
        return null;
      }

      const continuesBurst = buffer.length > 0 && now - lastKeyTime <= maxIntervalMs;
      if (!continuesBurst && buffer.length > 0) {
        // Gap too long since the last digit — this is human typing, restart the buffer.
        buffer = '';
      }

      buffer += ch;
      lastKeyTime = now;
      lastKeyWasBurstContinuation = continuesBurst;
      return null;
    },

    /**
     * True when the key just processed by `handleKey` extended an already-in-progress
     * fast burst (i.e. it was NOT the first character), or confirmed one on Enter.
     * Callers can `event.preventDefault()` on these keys so they don't leak into
     * whatever DOM element currently has focus — the very first character of a
     * genuine scan can still leak (there's no way to know in advance), which is an
     * accepted, documented tradeoff rather than something worth over-engineering.
     */
    wasPartOfBurst(): boolean {
      return lastKeyWasBurstContinuation;
    }
  };
}
