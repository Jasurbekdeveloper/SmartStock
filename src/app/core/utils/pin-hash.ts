/**
 * Approval PINs are stored only as a slow salted hash (PBKDF2-SHA256), never as text.
 * A short PIN can't be made secret against someone who reads the hash, so this is a
 * soft control at the till — the slow hash just makes guessing costly.
 */
export const PIN_ITERATIONS = 150_000;

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function newSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPin(pin: string, salt: string, iterations = PIN_ITERATIONS): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations }, key, 256);
  return toBase64(new Uint8Array(bits));
}
