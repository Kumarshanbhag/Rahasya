import { argon2id } from '@noble/hashes/argon2';
import { BLOB_OVERHEAD, CRYPTO, SEALED_KEY_BYTES, WRAPPED_KEY_BYTES } from '@rahasya/config';
import sodium from 'react-native-libsodium';
import {
  createAccountKeys,
  deriveKeys,
  fromBase64,
  generatePassword,
  hkdf,
  open,
  randomId,
  openJson,
  ready,
  seal,
  sealForRecovery,
  sealJson,
  toBase64,
  unlockVault,
  WrongPasswordError,
} from './index';

/** Cheap settings so the suite stays fast; production uses CRYPTO.argon2. */
const FAST = { memoryKiB: CRYPTO.argon2Min.memoryKiB, iterations: 1, parallelism: 1 };
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (h: string) => new Uint8Array(Buffer.from(h, 'hex'));

beforeAll(() => ready());

describe('key derivation', () => {
  it('HKDF-SHA-256 matches RFC 5869 test case 3 (no salt, no info)', () => {
    expect(hex(hkdf(bytes('0b'.repeat(22)), '', 42))).toBe(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
    );
  });

  it('Argon2id gives the same master key as an independent implementation', () => {
    const salt = bytes('000102030405060708090a0b0c0d0e0f');
    const ours = sodium.crypto_pwhash(32, 'correct horse battery staple', salt, FAST.iterations, FAST.memoryKiB * 1024, sodium.crypto_pwhash_ALG_ARGON2ID13);
    const reference = argon2id('correct horse battery staple', salt, { t: FAST.iterations, m: FAST.memoryKiB, p: 1, dkLen: 32 });
    expect(hex(ours)).toBe(hex(reference));
  });

  it('splits the master key into an auth key for the server and a wrap key that never leaves the device', () => {
    const salt = bytes('000102030405060708090a0b0c0d0e0f');
    const keys = deriveKeys('correct horse battery staple', salt, FAST);
    const master = argon2id('correct horse battery staple', salt, { t: 1, m: FAST.memoryKiB, p: 1, dkLen: 32 });
    expect(hex(keys.authKey)).toBe(hex(hkdf(master, CRYPTO.hkdfInfo.auth, 32)));
    expect(hex(keys.wrapKey)).toBe(hex(hkdf(master, CRYPTO.hkdfInfo.wrap, 32)));
    expect(hex(keys.authKey)).not.toBe(hex(keys.wrapKey));
  });

  it('a different password gives different keys', () => {
    const salt = bytes('000102030405060708090a0b0c0d0e0f');
    expect(hex(deriveKeys('password one', salt, FAST).authKey)).not.toBe(hex(deriveKeys('password two', salt, FAST).authKey));
  });
});

describe('sealed blobs', () => {
  const key = () => sodium.randombytes_buf(32);

  it('round-trips, in the format the server checks: version, algorithm, 24-byte nonce, ciphertext, 16-byte tag', () => {
    const k = key();
    const blob = seal(k, new TextEncoder().encode('hunter2'));
    expect([blob[0], blob[1]]).toEqual([CRYPTO.version, CRYPTO.algXChaCha20Poly1305]);
    expect(blob.length).toBe(BLOB_OVERHEAD + 7);
    expect(new TextDecoder().decode(open(k, blob))).toBe('hunter2');
  });

  it('uses a fresh nonce every time, so the same secret never looks the same twice', () => {
    const k = key();
    expect(hex(seal(k, new Uint8Array([1, 2, 3])))).not.toBe(hex(seal(k, new Uint8Array([1, 2, 3]))));
  });

  it('refuses a blob with any single byte changed, never returning garbage', () => {
    const k = key();
    const blob = seal(k, new TextEncoder().encode('transaction PIN 4821'));
    for (let i = 0; i < blob.length; i++) {
      const tampered = blob.slice();
      tampered[i]! ^= 0x01;
      expect(() => open(k, tampered)).toThrow();
    }
  });

  it('refuses the wrong key', () => {
    expect(() => open(key(), seal(key(), new Uint8Array([1])))).toThrow();
  });

  it('carries entries as JSON', () => {
    const k = key();
    const entry = { name: 'HDFC Bank', fields: [{ label: 'Transaction PIN', value: '4821', hidden: true }] };
    expect(openJson(k, sealJson(k, entry))).toEqual(entry);
  });
});

describe('accounts', () => {
  it('creates everything sign-up sends, with the sizes the server expects', () => {
    const account = createAccountKeys('correct horse battery staple', FAST);
    expect(account.authKey).toHaveLength(CRYPTO.keyBytes);
    expect(account.kdfSalt).toHaveLength(CRYPTO.saltBytes);
    expect(account.wrappedVaultKey).toHaveLength(WRAPPED_KEY_BYTES);
    expect(account.kdfParams).toEqual(FAST);
  });

  it('unlocks the vault key again with the same master password', () => {
    const account = createAccountKeys('correct horse battery staple', FAST);
    const unlocked = unlockVault('correct horse battery staple', account);
    expect(hex(unlocked.vaultKey)).toBe(hex(account.vaultKey));
    expect(hex(unlocked.authKey)).toBe(hex(account.authKey));
  });

  it('says plainly when the master password is wrong', () => {
    const account = createAccountKeys('correct horse battery staple', FAST);
    expect(() => unlockVault('Correct horse battery staple', account)).toThrow(WrongPasswordError);
  });

  it('seals the vault key for emergency recovery so only the organisation key can open it', () => {
    const org = sodium.crypto_box_keypair();
    const vaultKey = sodium.randombytes_buf(32);
    const sealed = sealForRecovery(vaultKey, org.publicKey);
    expect(sealed).toHaveLength(SEALED_KEY_BYTES);
    expect(hex(sodium.crypto_box_seal_open(sealed, org.publicKey, org.privateKey))).toBe(hex(vaultKey));
  });

  it('speaks the API wire format: standard base64 with padding', () => {
    const b = new Uint8Array([251, 255, 0, 1]);
    expect(toBase64(b)).toBe('+/8AAQ==');
    expect(hex(fromBase64('+/8AAQ=='))).toBe(hex(b));
  });
});

describe('ids', () => {
  it('makes random v4 UUIDs, the shape the server accepts for new entries', () => {
    const ids = Array.from({ length: 50 }, () => randomId());
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(ids).size).toBe(50);
  });
});

describe('password generator', () => {
  const all = { length: 18, upper: true, lower: true, digits: true, symbols: true, avoidLookalikes: false };

  it('makes passwords of the asked length with at least one of each chosen kind', () => {
    for (let i = 0; i < 200; i++) {
      const p = generatePassword(all);
      expect(p).toHaveLength(18);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[0-9]/);
      expect(p).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('uses only the kinds of character asked for', () => {
    for (let i = 0; i < 100; i++) expect(generatePassword({ ...all, upper: false, symbols: false })).toMatch(/^[a-z0-9]+$/);
  });

  it('can leave out characters that look alike (0 O o 1 l I |)', () => {
    for (let i = 0; i < 200; i++) expect(generatePassword({ ...all, avoidLookalikes: true })).not.toMatch(/[0Oo1lI|]/);
  });

  it('spreads characters evenly (no modulo bias)', () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) for (const c of generatePassword({ ...all, upper: false, digits: false, symbols: false, length: 26 })) counts.set(c, (counts.get(c) ?? 0) + 1);
    const values = [...counts.values()];
    expect(counts.size).toBe(26);
    expect(Math.min(...values) / Math.max(...values)).toBeGreaterThan(0.85);
  });

  it('refuses settings that cannot make a password', () => {
    expect(() => generatePassword({ ...all, upper: false, lower: false, digits: false, symbols: false })).toThrow();
  });
});
