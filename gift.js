// The personal part of this app is published only in encrypted form (gift.enc.json).
// The code turns it back into readable text here on the phone, using the browser's own
// cryptography. The code and the readable text are never sent anywhere.
import * as D from './dates.js';
import { cleanDetails } from './birth.js';

const fromBase64 = (text) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');

export const normalizeCode = (code) => String(code).toUpperCase().replace(/[^0-9A-Z]/g, '');

// Also protects against anything unexpected in a restored backup.
export function cleanGift(raw) {
  if (!raw || !text(raw.name, 80) || !D.isValid(raw.birthDate)) return null;
  return {
    name: text(raw.name, 80),
    birthDate: raw.birthDate,
    birthDetails: cleanDetails(raw.birthDetails),
    greeting: text(raw.greeting, 200),
    headline: text(raw.headline, 200),
    message: Array.isArray(raw.message) ? raw.message.map((line) => text(line, 2000)).filter(Boolean) : [],
    signoff: text(raw.signoff, 200),
    sender: text(raw.sender, 200),
  };
}

export class WrongCode extends Error {}

export async function unseal(sealed, code) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey'],
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(sealed.salt), iterations: sealed.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.data),
    );
  } catch {
    throw new WrongCode();
  }
  const gift = cleanGift(JSON.parse(new TextDecoder().decode(plain)));
  if (!gift) throw new WrongCode();
  return gift;
}
