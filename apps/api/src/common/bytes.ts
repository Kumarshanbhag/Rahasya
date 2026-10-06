import { BLOB_OVERHEAD, CRYPTO } from '@rahasya/config';
import { registerDecorator } from 'class-validator';

// Bytes travel as standard base64 with padding (libsodium's ORIGINAL variant).
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const decode = (value: unknown) => (typeof value === 'string' && BASE64.test(value) ? Buffer.from(value, 'base64') : null);

export const bytes = (base64: string) => new Uint8Array(Buffer.from(base64, 'base64'));
export const b64 = (data: Uint8Array) => Buffer.from(data).toString('base64');

function rule(name: string, message: string, validate: (value: unknown) => boolean): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({ name, target: target.constructor, propertyName: String(propertyName), options: { message }, validator: { validate } });
}

/** Exactly `length` bytes, base64: keys and salts. */
export const IsBytes = (length: number) =>
  rule('isBytes', `$property must be ${length} bytes, base64`, (v) => decode(v)?.length === length);

/**
 * A blob in Rahasya's ciphertext format: version 0x01 · algorithm 0x01 (XChaCha20-Poly1305) ·
 * 24-byte nonce · ciphertext · 16-byte tag. The API can't decrypt it, but it can refuse anything else.
 */
export const IsCiphertext = (maxBytes: number, minBytes = BLOB_OVERHEAD) =>
  rule('isCiphertext', '$property must be a Rahasya ciphertext blob, base64', (v) => {
    const blob = decode(v);
    return !!blob && blob.length >= minBytes && blob.length <= maxBytes && blob[0] === CRYPTO.version && blob[1] === CRYPTO.algXChaCha20Poly1305;
  });
