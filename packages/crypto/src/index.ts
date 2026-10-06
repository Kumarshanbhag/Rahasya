/**
 * All of Rahasya's encryption, on the device. The master password, the keys and any plaintext never leave this
 * module unencrypted; the server only ever receives the auth key, wrapped keys and sealed blobs.
 *
 * master password --Argon2id--> master key --HKDF--> auth key (proves the password to the server)
 *                                                └--> wrap key (encrypts the vault key)
 * vault key (random, made once at sign-up) encrypts every entry, group name and label.
 */
import { BLOB_OVERHEAD, CRYPTO } from '@rahasya/config';
import * as sodium from 'react-native-libsodium';

// The web build needs the larger libsodium build for Argon2id; on Android this is a no-op.
sodium.loadSumoVersion();

/** Resolves once libsodium is loaded. Await it before the first call. */
export const ready = () => sodium.ready;

export type KdfParams = { memoryKiB: number; iterations: number; parallelism: number };

export class WrongPasswordError extends Error {
  constructor() {
    super('Incorrect master password');
    this.name = 'WrongPasswordError';
  }
}

/** Overwrites key material once it's no longer needed. */
export const wipe = (...keys: Uint8Array[]) => keys.forEach((k) => k.fill(0));

export const toBase64 = (data: Uint8Array) => sodium.to_base64(data, sodium.base64_variants.ORIGINAL);
export const fromBase64 = (text: string) => sodium.from_base64(text, sodium.base64_variants.ORIGINAL);

/** HKDF-SHA-256 with no salt: extracts from `input`, then expands `info` to `length` bytes. */
export function hkdf(input: Uint8Array, info: string, length: number) {
  const prk = sodium._unstable_crypto_kdf_hkdf_sha256_extract(input, new Uint8Array(0));
  const out = sodium._unstable_crypto_kdf_hkdf_sha256_expand(prk, info, length);
  wipe(prk);
  return out;
}

/** The slow, memory-hard step that makes guessing a master password expensive. */
export function deriveKeys(password: string, salt: Uint8Array, params: KdfParams) {
  const master = sodium.crypto_pwhash(CRYPTO.keyBytes, password, salt, params.iterations, params.memoryKiB * 1024, sodium.crypto_pwhash_ALG_ARGON2ID13);
  const keys = { authKey: hkdf(master, CRYPTO.hkdfInfo.auth, CRYPTO.keyBytes), wrapKey: hkdf(master, CRYPTO.hkdfInfo.wrap, CRYPTO.keyBytes) };
  wipe(master);
  return keys;
}

// The header is also authenticated, so changing even the version byte makes decryption fail.
const HEADER = new Uint8Array([CRYPTO.version, CRYPTO.algXChaCha20Poly1305]);
const HEADER_AD = String.fromCharCode(...HEADER);

/** Encrypts with XChaCha20-Poly1305 and a fresh random nonce, as: version · algorithm · nonce · ciphertext · tag. */
export function seal(key: Uint8Array, plaintext: Uint8Array) {
  const nonce = sodium.randombytes_buf(CRYPTO.nonceBytes);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, HEADER_AD, null, nonce, key);
  const blob = new Uint8Array(HEADER.length + nonce.length + ciphertext.length);
  blob.set(HEADER);
  blob.set(nonce, HEADER.length);
  blob.set(ciphertext, HEADER.length + nonce.length);
  return blob;
}

/** Decrypts a blob from seal. Throws on a wrong key or any changed byte; never returns garbage. */
export function open(key: Uint8Array, blob: Uint8Array) {
  if (blob.length < BLOB_OVERHEAD || blob[0] !== CRYPTO.version || blob[1] !== CRYPTO.algXChaCha20Poly1305) {
    throw new Error('Not a Rahasya ciphertext');
  }
  const nonce = blob.subarray(HEADER.length, HEADER.length + CRYPTO.nonceBytes);
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(null, blob.subarray(HEADER.length + CRYPTO.nonceBytes), HEADER_AD, nonce, key);
}

export const sealJson = (key: Uint8Array, value: unknown) => seal(key, new TextEncoder().encode(JSON.stringify(value)));
export const openJson = <T>(key: Uint8Array, blob: Uint8Array) => JSON.parse(new TextDecoder().decode(open(key, blob))) as T;

/** Sign-up: a new random vault key, wrapped under the master password, plus what the server needs to verify it. */
export function createAccountKeys(password: string, kdfParams: KdfParams = { ...CRYPTO.argon2 }) {
  const kdfSalt = sodium.randombytes_buf(CRYPTO.saltBytes);
  const { authKey, wrapKey } = deriveKeys(password, kdfSalt, kdfParams);
  const vaultKey = sodium.randombytes_buf(CRYPTO.keyBytes);
  const wrappedVaultKey = seal(wrapKey, vaultKey);
  wipe(wrapKey);
  return { authKey, kdfSalt, kdfParams, wrappedVaultKey, vaultKey };
}

/** Unlock and sign-in: re-derives the keys from the master password and opens the wrapped vault key. */
export function unlockVault(password: string, account: { kdfSalt: Uint8Array; kdfParams: KdfParams; wrappedVaultKey: Uint8Array }) {
  const { authKey, wrapKey } = deriveKeys(password, account.kdfSalt, account.kdfParams);
  try {
    return { authKey, vaultKey: open(wrapKey, account.wrappedVaultKey) };
  } catch {
    wipe(authKey);
    throw new WrongPasswordError();
  } finally {
    wipe(wrapKey);
  }
}

/** Emergency recovery opt-in: a copy of the vault key only the organisation's offline key can open. */
export const sealForRecovery = (vaultKey: Uint8Array, organisationPublicKey: Uint8Array) => sodium.crypto_box_seal(vaultKey, organisationPublicKey);

/** A random v4 UUID, for ids the device chooses (new entries, groups, labels) so they can be created offline. */
export function randomId() {
  const b = sodium.randombytes_buf(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type PasswordOptions = { length: number; upper: boolean; lower: boolean; digits: boolean; symbols: boolean; avoidLookalikes: boolean };

const CHARACTERS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/|~',
};
const LOOKALIKES = /[0Oo1lI|]/g;

/** A uniformly random whole number below max, from libsodium's random source; draws that would bias the result are thrown away. */
function randomBelow(max: number) {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) {
    const [a, b, c, d] = sodium.randombytes_buf(4);
    const n = ((a! << 24) | (b! << 16) | (c! << 8) | d!) >>> 0;
    if (n < limit) return n % max;
  }
}

/** A random password with at least one character of every chosen kind, generated on the device. */
export function generatePassword(options: PasswordOptions) {
  const sets = (Object.keys(CHARACTERS) as (keyof typeof CHARACTERS)[])
    .filter((kind) => options[kind])
    .map((kind) => (options.avoidLookalikes ? CHARACTERS[kind].replace(LOOKALIKES, '') : CHARACTERS[kind]));
  if (!sets.length || options.length < sets.length) throw new Error('Choose at least one kind of character');
  const pool = sets.join('');
  const pick = (from: string) => from[randomBelow(from.length)]!;
  const chars = [...sets.map(pick), ...Array.from({ length: options.length - sets.length }, () => pick(pool))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
