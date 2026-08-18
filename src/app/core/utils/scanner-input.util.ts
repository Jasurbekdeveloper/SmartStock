/**
 * Detects input from a USB/Bluetooth "barcode scanner gun", which behaves like
 * a keyboard that types digits far faster than a human (typically <20ms/char)
 * and terminates the scan with an Enter keypress. Feed every keydown event on
 * a text input through `.handleKey()` — normal human typing is left untouched
 * (returns null), while a detected scan returns the buffered code.
 */
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

      if (event.key.length !== 1 || !/[0-9]/.test(event.key)) {
        buffer = '';
        lastKeyWasBurstContinuation = false;
        return null;
      }

      const continuesBurst = buffer.length > 0 && now - lastKeyTime <= maxIntervalMs;
      if (!continuesBurst && buffer.length > 0) {
        // Gap too long since the last digit — this is human typing, restart the buffer.
        buffer = '';
      }

      buffer += event.key;
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
