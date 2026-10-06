import type { ApiClient, SyncItem } from '@rahasya/api-client';
import { fromBase64, openJson, ready, sealJson, toBase64 } from '@rahasya/crypto';
import { blankEntry, type EntryData } from '../entry';
import { createVault } from '../vault-store';

let vaultKey: Uint8Array;
beforeAll(async () => {
  await ready();
  vaultKey = new Uint8Array(32).fill(7);
});

function login(name: string, password = 'Qv7#mR2!tL9x'): EntryData {
  const e = blankEntry('login');
  e.name = name;
  e.fields[0]!.value = 'priya@example.com';
  e.fields[1]!.value = password;
  return e;
}

const serverItem = (id: string, data: EntryData | null, extra: Partial<SyncItem> = {}): SyncItem => ({
  id,
  groupId: null,
  labelIds: [],
  blob: data && toBase64(sealJson(vaultKey, data)),
  revision: 1,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
  deletedAt: null,
  ...extra,
});

function setup(api: Partial<ApiClient> = {}) {
  const fullApi = {
    sync: jest.fn(async () => ({ revision: 0, full: true, items: [], groups: [], labels: [] })),
    putItem: jest.fn(async (_t: string, id: string) => ({ id, revision: 5, conflict: false })),
    trashItem: jest.fn(async (_t: string, id: string) => ({ id, revision: 6, deletedAt: '2026-10-06T10:00:00.000Z' })),
    restoreItem: jest.fn(async (_t: string, id: string) => ({ id, revision: 7 })),
    purgeItem: jest.fn(async (_t: string, id: string) => ({ id, revision: 8 })),
    ...api,
  } as unknown as jest.Mocked<ApiClient>;
  const session = { getState: () => ({ vaultKey, authorized: <T,>(call: (token: string) => Promise<T>) => call('jwt') }) };
  return { api: fullApi, vault: createVault({ api: fullApi, session }) };
}

it('decrypts what the server sends and remembers where it got to', async () => {
  const { api, vault } = setup({
    sync: jest.fn(async () => ({ revision: 3, full: true, items: [serverItem('e1', login('Netflix'))], groups: [], labels: [] })),
  });
  await vault.getState().sync();
  expect(vault.getState().entries.e1?.data.name).toBe('Netflix');
  expect(vault.getState().revision).toBe(3);
  await vault.getState().sync();
  expect(api.sync).toHaveBeenLastCalledWith('jwt', 3);
});

it('applies changes from other devices: updates, Trash and entries deleted forever', async () => {
  const sync = jest
    .fn()
    .mockResolvedValueOnce({ revision: 2, full: true, items: [serverItem('e1', login('Netflix')), serverItem('e2', login('Gmail'))], groups: [], labels: [] })
    .mockResolvedValueOnce({
      revision: 4,
      full: false,
      items: [serverItem('e1', login('Netflix'), { deletedAt: '2026-10-06T09:00:00.000Z' }), serverItem('e2', null)],
      groups: [],
      labels: [],
    });
  const { vault } = setup({ sync });
  await vault.getState().sync();
  await vault.getState().sync();
  expect(vault.getState().entries.e1?.deletedAt).toBe('2026-10-06T09:00:00.000Z');
  expect(vault.getState().entries.e2).toBeUndefined();
});

it('skips an entry it cannot decrypt instead of failing the whole vault', async () => {
  const broken = { ...serverItem('bad', login('x')), blob: toBase64(sealJson(new Uint8Array(32).fill(9), login('x'))) };
  const { vault } = setup({ sync: jest.fn(async () => ({ revision: 1, full: true, items: [broken, serverItem('ok', login('Gmail'))], groups: [], labels: [] })) });
  await vault.getState().sync();
  expect(Object.keys(vault.getState().entries)).toEqual(['ok']);
  expect(vault.getState().unreadable).toBe(1);
});

it('encrypts a new entry before saving it; the server never sees the password', async () => {
  const { api, vault } = setup();
  const { id } = await vault.getState().save({ data: login('  Netflix ') });
  const [, sentId, body] = api.putItem.mock.calls[0]!;
  expect(sentId).toBe(id);
  expect(JSON.stringify(body)).not.toContain('Qv7#mR2!tL9x');
  expect(openJson<EntryData>(vaultKey, fromBase64(body.blob)).name).toBe('Netflix');
  expect(vault.getState().entries[id]).toMatchObject({ revision: 5, data: { name: 'Netflix' } });
});

it('saving an edit sends the revision it started from and keeps the old password in history', async () => {
  const { api, vault } = setup({
    sync: jest.fn(async () => ({ revision: 1, full: true, items: [serverItem('e1', login('Netflix', 'old password'))], groups: [], labels: [] })),
    putItem: jest.fn(async (_t: string, id: string) => ({ id, revision: 9, conflict: true })),
  });
  await vault.getState().sync();
  const edited = structuredClone(vault.getState().entries.e1!.data);
  edited.fields[1]!.value = 'new password';
  expect(await vault.getState().save({ id: 'e1', data: edited })).toEqual({ id: 'e1', conflict: true });
  expect(api.putItem.mock.calls[0]![2].baseRevision).toBe(1);
  expect(vault.getState().entries.e1!.data.passwordHistory[0]?.value).toBe('old password');
});

it('moves entries to Trash, restores them and deletes them forever', async () => {
  const { vault } = setup({ sync: jest.fn(async () => ({ revision: 1, full: true, items: [serverItem('e1', login('Netflix'))], groups: [], labels: [] })) });
  await vault.getState().sync();
  await vault.getState().trash('e1');
  expect(vault.getState().entries.e1?.deletedAt).toBeTruthy();
  await vault.getState().restore('e1');
  expect(vault.getState().entries.e1?.deletedAt).toBeNull();
  await vault.getState().trash('e1');
  await vault.getState().purge('e1');
  expect(vault.getState().entries.e1).toBeUndefined();
});

it('forgets every decrypted entry when the vault locks', async () => {
  const { vault } = setup({ sync: jest.fn(async () => ({ revision: 1, full: true, items: [serverItem('e1', login('Netflix'))], groups: [], labels: [] })) });
  await vault.getState().sync();
  vault.getState().clear();
  expect(vault.getState()).toMatchObject({ entries: {}, revision: 0 });
});
