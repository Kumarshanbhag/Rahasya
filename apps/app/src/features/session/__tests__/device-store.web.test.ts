/**
 * @jest-environment node
 */
import 'fake-indexeddb/auto';
import { deviceStore } from '../device-store.web';

// Browsers store CryptoKey objects in IndexedDB as they are; Jest's sandbox breaks that when cloning, so keep keys as-is.
const clone = globalThis.structuredClone;
globalThis.structuredClone = ((value: unknown, options?: StructuredSerializeOptions) =>
  value instanceof CryptoKey ? value : clone(value, options)) as typeof structuredClone;
import type { SavedAccount } from '../device-store.types';

const account: SavedAccount = {
  email: 'priya@example.com',
  userId: 'u1',
  deviceId: 'd1',
  kdfSalt: 'AAECAwQFBgcICQoLDA0ODw==',
  kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1 },
  wrappedVaultKey: 'AQE=',
  accessToken: 'jwt',
  refreshToken: 'r'.repeat(43),
};

async function rawRecords() {
  const db = await new Promise<IDBDatabase>((resolve) => {
    const req = indexedDB.open('rahasya');
    req.onsuccess = () => resolve(req.result);
  });
  return new Promise<unknown[]>((resolve) => {
    const req = db.transaction('device').objectStore('device').getAll();
    req.onsuccess = () => resolve(req.result);
  });
}

it('has nothing saved on a fresh browser', async () => {
  expect(await deviceStore.read()).toBeNull();
});

it('keeps the account between visits', async () => {
  await deviceStore.save(account);
  expect(await deviceStore.read()).toEqual(account);
});

it('stores it encrypted under a key the page can use but never export', async () => {
  await deviceStore.save(account);
  const records = await rawRecords();
  expect(JSON.stringify(records)).not.toContain('priya@example.com');
  const key = records.find((r): r is CryptoKey => r instanceof CryptoKey);
  expect(key?.extractable).toBe(false);
});

it('forgets everything on sign-out', async () => {
  await deviceStore.save(account);
  await deviceStore.forget();
  expect(await deviceStore.read()).toBeNull();
});
