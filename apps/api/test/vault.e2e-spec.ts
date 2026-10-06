import type { NestExpressApplication } from '@nestjs/platform-express';
import { LIMITS, PASSWORD_HISTORY_MAX } from '@rahasya/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { VaultService } from '../src/vault/vault.service';
import { createApp, fakeBlob, type Session, signUp } from './helpers';

const DAY = 24 * 60 * 60 * 1000;

describe('Vault entries: save, sync, edit, history, Trash', () => {
  let app: NestExpressApplication;
  let me: Session;
  const api = () => request(app.getHttpServer());
  const put = (id: string, body: object, who = me) => api().put(`/vault/items/${id}`).set('Authorization', who.bearer).send(body);
  const del = (id: string, query = '') => api().delete(`/vault/items/${id}${query}`).set('Authorization', me.bearer);
  const restore = (id: string) => api().post(`/vault/items/${id}/restore`).set('Authorization', me.bearer);
  const history = (id: string, who = me) => api().get(`/vault/items/${id}/history`).set('Authorization', who.bearer);
  const sync = async (since = 0, who = me) => (await api().get(`/vault/sync?since=${since}`).set('Authorization', who.bearer).expect(200)).body;

  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    me = await signUp(app); // a fresh, empty vault per test
  });
  afterAll(() => app.close());

  it('saves a new entry, and sync returns it', async () => {
    const id = randomUUID();
    const blob = fakeBlob();
    expect((await put(id, { blob }).expect(200)).body).toEqual({ id, revision: 1, conflict: false });
    expect(await sync()).toMatchObject({
      revision: 1,
      full: true,
      items: [{ id, blob, revision: 1, groupId: null, labelIds: [], deletedAt: null }],
    });
  });

  it('an incremental sync returns only what changed', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    await put(a, { blob: fakeBlob() }).expect(200);
    const { revision } = await sync();
    await put(b, { blob: fakeBlob() }).expect(200);
    const changes = await sync(revision);
    expect(changes.full).toBe(false);
    expect(changes.items.map((i: { id: string }) => i.id)).toEqual([b]);
  });

  it('an edit keeps the replaced version; a stale base revision is flagged and nothing is lost', async () => {
    const id = randomUUID();
    const [v1, v2, v3] = [fakeBlob(), fakeBlob(), fakeBlob()];
    await put(id, { blob: v1 }).expect(200);
    expect((await put(id, { blob: v2, baseRevision: 1 }).expect(200)).body.conflict).toBe(false);
    // Another device edited from revision 1 too.
    expect((await put(id, { blob: v3, baseRevision: 1 }).expect(200)).body.conflict).toBe(true);
    expect((await history(id).expect(200)).body.map((h: { blob: string }) => h.blob)).toEqual([v2, v1]);
  });

  it(`keeps the last ${PASSWORD_HISTORY_MAX} versions`, async () => {
    const id = randomUUID();
    for (let i = 0; i < PASSWORD_HISTORY_MAX + 3; i++) await put(id, { blob: fakeBlob() }).expect(200);
    expect((await history(id).expect(200)).body).toHaveLength(PASSWORD_HISTORY_MAX);
  });

  it('never loses a version when two devices save at once', async () => {
    const id = randomUUID();
    const [v0, a, b] = [fakeBlob(), fakeBlob(), fakeBlob()];
    await put(id, { blob: v0 }).expect(200);
    await Promise.all([put(id, { blob: a }).expect(200), put(id, { blob: b }).expect(200)]);
    const [item] = (await sync()).items;
    const older = (await history(id)).body.map((h: { blob: string }) => h.blob);
    expect([item.blob, ...older].sort()).toEqual([v0, a, b].sort());
  });

  it('keeps vaults apart', async () => {
    const id = randomUUID();
    await put(id, { blob: fakeBlob() }).expect(200);
    const other = await signUp(app);
    await put(id, { blob: fakeBlob() }, other).expect(404);
    await history(id, other).expect(404);
    await api().delete(`/vault/items/${id}`).set('Authorization', other.bearer).expect(404);
    expect((await sync(0, other)).items).toEqual([]);
  });

  it('accepts only ciphertext blobs, and only with a session', async () => {
    const plaintext = Buffer.from('{"password":"hunter2"}').toString('base64');
    await put(randomUUID(), { blob: plaintext }).expect(400);
    await put(randomUUID(), { blob: fakeBlob(LIMITS.itemBlobMaxBytes) }).expect(400);
    await api().get('/vault/sync').expect(401);
  });

  it('Trash: delete, undo, then delete forever', async () => {
    const id = randomUUID();
    await put(id, { blob: fakeBlob() }).expect(200);
    await put(id, { blob: fakeBlob() }).expect(200);
    await del(id, '?forever=true').expect(400); // only from Trash

    expect((await del(id).expect(200)).body.deletedAt).toBeTruthy();
    await restore(id).expect(200); // the 5 s Undo
    expect((await sync()).items[0].deletedAt).toBeNull();

    await del(id).expect(200);
    await del(id, '?forever=true').expect(200);
    expect((await sync()).items).toEqual([expect.objectContaining({ id, blob: null })]);
    expect((await history(id).expect(200)).body).toEqual([]);
    await put(id, { blob: fakeBlob() }).expect(410);
    await restore(id).expect(410);
  });

  it('purges Trash and old history after 30 days', async () => {
    const [trashed, edited] = [randomUUID(), randomUUID()];
    await put(trashed, { blob: fakeBlob() }).expect(200);
    await del(trashed).expect(200);
    await put(edited, { blob: fakeBlob() }).expect(200);
    await put(edited, { blob: fakeBlob() }).expect(200);

    const prisma = app.get(PrismaService);
    const monthAgo = new Date(Date.now() - 31 * DAY);
    await prisma.vaultItem.update({ where: { id: trashed }, data: { deletedAt: monthAgo } });
    await prisma.itemHistory.updateMany({ where: { itemId: edited }, data: { createdAt: monthAgo } });
    await app.get(VaultService).purgeExpired();

    const items = (await sync()).items;
    expect(items.find((i: { id: string }) => i.id === trashed).blob).toBeNull();
    expect(items.find((i: { id: string }) => i.id === edited).blob).not.toBeNull();
    expect((await history(edited)).body).toEqual([]);
  });
});

describe('Groups and labels', () => {
  let app: NestExpressApplication;
  let me: Session;
  const api = () => request(app.getHttpServer());
  const putGroups = (groups: object[]) => api().put('/vault/groups').set('Authorization', me.bearer).send({ groups });
  const putLabels = (labels: object[]) => api().put('/vault/labels').set('Authorization', me.bearer).send({ labels });
  const putItem = (id: string, body: object) => api().put(`/vault/items/${id}`).set('Authorization', me.bearer).send(body);
  const sync = async (since = 0) => (await api().get(`/vault/sync?since=${since}`).set('Authorization', me.bearer).expect(200)).body;
  const group = (parentId: string | null = null) => ({ id: randomUUID(), parentId, nameEnc: fakeBlob(16), sortOrder: 0 });

  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    me = await signUp(app);
  });
  afterAll(() => app.close());

  it('nests groups up to 3 levels, in any order within a batch', async () => {
    const work = group();
    const aws = group(work.id);
    const prod = group(aws.id);
    await putGroups([prod, aws, work]).expect(200);
    await putGroups([group(prod.id)]).expect(400);
    expect((await api().get('/vault/groups').set('Authorization', me.bearer).expect(200)).body).toHaveLength(3);
  });

  it('refuses cycles, unknown parents, and moves that push subgroups too deep', async () => {
    const a = group();
    const b = group(a.id);
    const c = group();
    const d = group(c.id);
    await putGroups([a, b, c, d]).expect(200);
    await putGroups([{ ...a, parentId: b.id }]).expect(400);
    await putGroups([group(randomUUID())]).expect(400);
    await putGroups([{ ...a, parentId: d.id }]).expect(400); // b would sit at level 4
  });

  it("can't touch another user's group", async () => {
    const mine = group();
    await putGroups([mine]).expect(200);
    me = await signUp(app);
    await putGroups([mine]).expect(404);
  });

  it('deleting a group needs its subgroups gone first, and moves its entries to Unsorted', async () => {
    const work = group();
    const aws = group(work.id);
    await putGroups([work, aws]).expect(200);
    const id = randomUUID();
    await putItem(id, { blob: fakeBlob(), groupId: aws.id }).expect(200);

    await putGroups([{ ...work, deleted: true }]).expect(400);
    await putGroups([{ ...aws, deleted: true }]).expect(200);
    const after = await sync();
    expect(after.items[0].groupId).toBeNull();
    expect(after.groups.find((g: { id: string }) => g.id === aws.id).deletedAt).not.toBeNull();
    await putItem(randomUUID(), { blob: fakeBlob(), groupId: aws.id }).expect(400);
  });

  it('labels: attach to an entry; deleting a label takes it off and re-syncs the entry', async () => {
    const label = { id: randomUUID(), nameEnc: fakeBlob(8) };
    await putLabels([label]).expect(200);
    const id = randomUUID();
    await putItem(id, { blob: fakeBlob(), labelIds: [label.id] }).expect(200);
    const before = await sync();
    expect(before.items[0].labelIds).toEqual([label.id]);

    expect((await api().get('/vault/labels').set('Authorization', me.bearer).expect(200)).body).toEqual([expect.objectContaining({ id: label.id, nameEnc: label.nameEnc })]);
    await putLabels([{ ...label, deleted: true }]).expect(200);
    expect((await api().get('/vault/labels').set('Authorization', me.bearer).expect(200)).body).toEqual([]);
    const after = await sync(before.revision);
    expect(after.items.map((i: { id: string; labelIds: string[] }) => [i.id, i.labelIds])).toEqual([[id, []]]);
    expect(after.labels[0].deletedAt).not.toBeNull();
    await putItem(id, { blob: fakeBlob(), labelIds: [label.id] }).expect(400);
  });
});
