import { createApiClient } from './index';

function respond(status: number, body?: unknown) {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
}

const authed = (method: string) => ({ method, headers: { authorization: 'Bearer jwt' } });
const authedJson = (method: string, body: unknown) => ({
  method,
  headers: { 'content-type': 'application/json', authorization: 'Bearer jwt' },
  body: JSON.stringify(body),
});

it('asks for everything changed since the last revision it saw', async () => {
  const result = { revision: 7, full: false, items: [], groups: [], labels: [] };
  const fetch = respond(200, result);
  const api = createApiClient({ baseUrl: 'https://api.test', fetch });
  expect(await api.sync('jwt', 5)).toEqual(result);
  expect(fetch).toHaveBeenCalledWith('https://api.test/vault/sync?since=5', authed('GET'));
});

it('saves an entry under the id the device chose', async () => {
  const fetch = respond(200, { id: 'e1', revision: 8, conflict: false });
  const api = createApiClient({ baseUrl: 'https://api.test', fetch });
  const body = { blob: 'AQE=', groupId: null, labelIds: [], baseRevision: 3 };
  expect(await api.putItem('jwt', 'e1', body)).toEqual({ id: 'e1', revision: 8, conflict: false });
  expect(fetch).toHaveBeenCalledWith('https://api.test/vault/items/e1', authedJson('PUT', body));
});

it('moves an entry to Trash, restores it, or deletes it forever', async () => {
  const fetch = respond(200, { id: 'e1', revision: 9 });
  const api = createApiClient({ baseUrl: 'https://api.test', fetch });
  await api.trashItem('jwt', 'e1');
  await api.restoreItem('jwt', 'e1');
  await api.purgeItem('jwt', 'e1');
  expect(fetch.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
    ['DELETE', 'https://api.test/vault/items/e1'],
    ['POST', 'https://api.test/vault/items/e1/restore'],
    ['DELETE', 'https://api.test/vault/items/e1?forever=true'],
  ]);
});

it('fetches older versions of an entry', async () => {
  const fetch = respond(200, [{ revision: 2, blob: 'AQE=', replacedAt: '2026-10-06T10:00:00.000Z' }]);
  const api = createApiClient({ baseUrl: 'https://api.test', fetch });
  expect(await api.itemHistory('jwt', 'e1')).toHaveLength(1);
  expect(fetch).toHaveBeenCalledWith('https://api.test/vault/items/e1/history', authed('GET'));
});

it('saves groups and labels in batches', async () => {
  const fetch = respond(200, { revision: 10 });
  const api = createApiClient({ baseUrl: 'https://api.test', fetch });
  const group = { id: 'g1', parentId: null, nameEnc: 'AQE=', sortOrder: 0 };
  await api.putGroups('jwt', [group]);
  await api.putLabels('jwt', [{ id: 'l1', nameEnc: 'AQE=' }]);
  expect(fetch).toHaveBeenNthCalledWith(1, 'https://api.test/vault/groups', authedJson('PUT', { groups: [group] }));
  expect(fetch).toHaveBeenNthCalledWith(2, 'https://api.test/vault/labels', authedJson('PUT', { labels: [{ id: 'l1', nameEnc: 'AQE=' }] }));
});
