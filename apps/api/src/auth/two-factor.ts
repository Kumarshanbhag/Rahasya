import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { TOTP } from '@rahasya/config';
import { env } from '../env';

/** RFC 6238 TOTP (HMAC-SHA1), the variant every authenticator app reads. */
export function totp(secret: Uint8Array, step: number, digits: number = TOTP.digits): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac('sha1', secret).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}

/** The matching time step: now ±1 for clock drift, and never one at or before the last code used (no replays). */
export function matchTotp(secret: Uint8Array, code: string, nowMs: number, lastStep: number | null): number | null {
  const now = Math.floor(nowMs / 1000 / TOTP.periodSec);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const expected = Buffer.from(totp(secret, step));
    if (code.length === expected.length && timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding, as otpauth:// URLs expect. */
export function base32(data: Uint8Array): string {
  let out = '';
  let bits = 0;
  let value = 0;
  for (const byte of data) {
    value = ((value << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function dataKey() {
  const key = Buffer.from(env('DATA_KEY'), 'base64');
  if (key.length !== 32) throw new Error('DATA_KEY must decode to 32 bytes');
  return key;
}

/** AES-256-GCM under the server's DATA_KEY: iv (12) · ciphertext · tag (16). Only TOTP secrets use it. */
export function seal(plain: Uint8Array): Uint8Array<ArrayBuffer> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv);
  return new Uint8Array(Buffer.concat([iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]));
}

export function unseal(sealed: Uint8Array): Buffer {
  const data = Buffer.from(sealed);
  const decipher = createDecipheriv('aes-256-gcm', dataKey(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(12, data.length - 16)), decipher.final()]);
}
