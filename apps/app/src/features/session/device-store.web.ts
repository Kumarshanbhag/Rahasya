import type { DeviceStore, SavedAccount } from './device-store.types';

const DB = 'rahasya';
const STORE = 'device';
const WRAPPING_KEY = 'wrapping-key';
const ACCOUNT = 'account';

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

function openDb() {
  const req = indexedDB.open(DB, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE);
  return request(req);
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openDb();
  try {
    return await request(run(db.transaction(STORE, mode).objectStore(STORE)));
  } finally {
    db.close();
  }
}

/**
 * An AES-GCM key created by the browser as non-extractable: this page can encrypt and decrypt with it, but no
 * script can ever read the key itself, so a copied IndexedDB file is useless on its own.
 */
async function wrappingKey() {
  const existing = await withStore<CryptoKey | undefined>('readonly', (s) => s.get(WRAPPING_KEY));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await withStore('readwrite', (s) => s.put(key, WRAPPING_KEY));
  return key;
}

/** Web: IndexedDB, encrypted under a non-extractable browser key. */
export const deviceStore: DeviceStore = {
  async read() {
    const saved = await withStore<{ iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer } | undefined>('readonly', (s) => s.get(ACCOUNT));
    if (!saved) return null;
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: saved.iv }, await wrappingKey(), saved.data);
    return JSON.parse(new TextDecoder().decode(plain)) as SavedAccount;
  },
  async save(account) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await wrappingKey(), new TextEncoder().encode(JSON.stringify(account)));
    await withStore('readwrite', (s) => s.put({ iv, data }, ACCOUNT));
  },
  async forget() {
    await withStore('readwrite', (s) => s.delete(ACCOUNT));
    await withStore('readwrite', (s) => s.delete(WRAPPING_KEY));
  },
};
