/// <reference types="node" />
/**
 * @jest-environment node
 *
 * The whole account journey against a real running API: create an account, lock, unlock offline, sign out, then
 * sign in again as on a new device. Skipped unless E2E_API_URL points at an API, e.g.
 *   E2E_API_URL=http://localhost:3000 pnpm --filter @rahasya/app test session.e2e
 */
import { createApiClient } from '@rahasya/api-client';
import { CRYPTO } from '@rahasya/config';
import { request } from 'node:http';
import type { SavedAccount } from '../device-store.types';

const API = process.env.E2E_API_URL;
const FAST = { memoryKiB: CRYPTO.argon2Min.memoryKiB, iterations: 1, parallelism: 1 };

/** The React Native test preset stubs out global fetch, so talk to the API over plain Node HTTP. */
function nodeFetch(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
  return new Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>((resolve, reject) => {
    const req = request(url, { method: init.method, headers: init.headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ ok: res.statusCode! < 400, status: res.statusCode!, json: async () => JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end(init.body);
  });
}

function memoryDevice() {
  let saved: SavedAccount | null = null;
  return { read: async () => saved, save: async (a: SavedAccount) => void (saved = a), forget: async () => void (saved = null) };
}

(API ? it : it.skip)('signs up, locks, unlocks, signs out and signs back in against the real API', async () => {
  // Loaded here, not at the top, so a skipped run never starts loading libsodium.
  const { toBase64 } = require('@rahasya/crypto') as typeof import('@rahasya/crypto');
  const { createSession } = require('../session') as typeof import('../session');
  const api = createApiClient({ baseUrl: API!, fetch: nodeFetch });
  const deviceInfo = { name: 'Integration test', platform: 'web' as const };
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'orbit candle mango thunder';

  const phone = createSession({ api, device: memoryDevice(), deviceInfo, kdfParams: FAST });
  await phone.getState().load();
  await phone.getState().signUp(email, password);
  const vaultKey = toBase64(phone.getState().vaultKey!);

  phone.getState().lock();
  expect(phone.getState().status).toBe('locked');
  await expect(phone.getState().unlock('not my password!!')).rejects.toMatchObject({ triesLeft: 4 });
  await phone.getState().unlock(password);
  expect(toBase64(phone.getState().vaultKey!)).toBe(vaultKey);
  await phone.getState().signOut();

  const laptop = createSession({ api, device: memoryDevice(), deviceInfo, kdfParams: FAST });
  await laptop.getState().load();
  await expect(laptop.getState().signIn(email, 'not my password!!', undefined)).rejects.toMatchObject({ status: 401, triesLeft: 4 });
  await laptop.getState().signIn(email, password, undefined);
  expect(laptop.getState().status).toBe('unlocked');
  expect(toBase64(laptop.getState().vaultKey!)).toBe(vaultKey);
});

(API ? it : it.skip)('an entry saved on one device opens on another, and the server only ever holds ciphertext', async () => {
  const { createSession } = require('../session') as typeof import('../session');
  const { createVault } = require('../../vault/vault-store') as typeof import('../../vault/vault-store');
  const { blankEntry } = require('../../vault/entry') as typeof import('../../vault/entry');
  const api = createApiClient({ baseUrl: API!, fetch: nodeFetch });
  const deviceInfo = { name: 'Integration test', platform: 'web' as const };
  const email = `e2e-vault-${Date.now()}@example.com`;
  const password = 'orbit candle mango thunder';

  const phone = createSession({ api, device: memoryDevice(), deviceInfo, kdfParams: FAST });
  await phone.getState().load();
  await phone.getState().signUp(email, password);
  const phoneVault = createVault({ api, session: phone });
  const entry = blankEntry('bank');
  entry.name = 'HDFC Bank';
  entry.fields[4]!.value = '4821';
  const { id } = await phoneVault.getState().save({ data: entry });

  const raw = await phone.getState().authorized((token) => api.sync(token, 0));
  expect(JSON.stringify(raw)).not.toContain('HDFC');
  expect(JSON.stringify(raw)).not.toContain('4821');

  const laptop = createSession({ api, device: memoryDevice(), deviceInfo, kdfParams: FAST });
  await laptop.getState().load();
  await laptop.getState().signIn(email, password, undefined);
  const laptopVault = createVault({ api, session: laptop });
  await laptopVault.getState().sync();
  expect(laptopVault.getState().entries[id]?.data).toMatchObject({ name: 'HDFC Bank', fields: [expect.objectContaining({ label: 'Transaction PIN', value: '4821' })] });
});
