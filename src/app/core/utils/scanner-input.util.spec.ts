import { describe, expect, it, vi } from 'vitest';
import { createScannerGunDetector } from './scanner-input.util';

function key(k: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return { key: k, code: '', ctrlKey: false, altKey: false, metaKey: false, ...extra } as KeyboardEvent;
}

function type(detector: ReturnType<typeof createScannerGunDetector>, events: KeyboardEvent[], gapMs: number) {
  let result: string | null = null;
  for (const e of events) {
    vi.advanceTimersByTime(gapMs);
    result = detector.handleKey(e) ?? result;
  }
  return result;
}

describe('createScannerGunDetector', () => {
  it('returns a fast digit burst ending in Enter', () => {
    vi.useFakeTimers();
    const d = createScannerGunDetector();
    expect(type(d, [...'4780069000130'].map((c) => key(c)).concat(key('Enter')), 5)).toBe('4780069000130');
    vi.useRealTimers();
  });

  it('keeps letters, Shift and the Ctrl+] separator of a Data Matrix code', () => {
    vi.useFakeTimers();
    const d = createScannerGunDetector();
    const events = [...'0104780069000130215'].map((c) => key(c));
    events.push(key('Shift'), key('A'), key('b'), key(']', { ctrlKey: true }), ...[...'93dG'].map((c) => key(c)), key('Enter'));
    expect(type(d, events, 5)).toBe('0104780069000130215Ab\u001d93dG');
    vi.useRealTimers();
  });

  it('ignores human-speed typing', () => {
    vi.useFakeTimers();
    const d = createScannerGunDetector();
    expect(type(d, [...'12345'].map((c) => key(c)).concat(key('Enter')), 200)).toBeNull();
    vi.useRealTimers();
  });
});
