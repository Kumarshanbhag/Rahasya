import type { NestExpressApplication } from '@nestjs/platform-express';
import { SEALED_KEY_BYTES } from '@rahasya/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AdminsService } from '../src/admin/admins.service';
import { AuditService } from '../src/audit/audit.service';
import { totp, unseal } from '../src/auth/two-factor';
import { PrismaService } from '../src/prisma.service';
import {
  acceptInvite,
  type AdminSession,
  adminSignIn,
  b64,
  createApp,
  fakeBlob,
  signUp,
  stepUp,
  superAdmin,
} from './helpers';
import { SoftKey } from './soft-key';

describe('Admin console', () => {
  let app: NestExpressApplication;
  let root: AdminSession;
  const api = () => request(app.getHttpServer());
  const as = (admin: { bearer: string }) => ({
    get: (url: string) => api().get(url).set('Authorization', admin.bearer),
    post: (url: string, body: object = {}) => api().post(url).set('Authorization', admin.bearer).send(body),
    patch: (url: string, body: object) => api().patch(url).set('Authorization', admin.bearer).send(body),
    delete: (url: string, body: object) => api().delete(url).set('Authorization', admin.bearer).send(body),
  });
  const roleId = async (name: string) => (await app.get(PrismaService).adminRole.findUniqueOrThrow({ where: { name } })).id;
  const inviteAdmin = async (role: string, by: AdminSession = root) => {
    const email = `admin-${randomUUID()}@rahasya.test`;
    const res = await as(by).post('/admin/admins', { email, name: `${role} admin`, roleId: await roleId(role) }).expect(201);
    return acceptInvite(app, res.body.inviteUrl, email);
  };
  const auditActions = async (category: string) =>
    (await as(root).get(`/admin/audit?category=${category}`).expect(200)).body.entries.map((e: { action: string }) => e.action);

  beforeAll(async () => {
    app = await createApp();
    root = await superAdmin(app);
  });
  afterAll(() => app.close());

  describe('Admin sign-in', () => {
    it('needs the password and the security key, and the session works only on admin routes', async () => {
      const me = await as(root).get('/admin/auth/me').expect(200);
      expect(me.body).toMatchObject({ id: root.id, isSuper: true, role: 'Owner' });
      await api().get('/vault/sync').set('Authorization', root.bearer).expect(401);
      const user = await signUp(app);
      await api().get('/admin/auth/me').set('Authorization', user.bearer).expect(401);
    });

    it("refuses a wrong password, an unknown email, someone else's key and a replayed challenge", async () => {
      await api().post('/admin/auth/signin').send({ email: root.email, password: 'wrong password' }).expect(401);
      await api().post('/admin/auth/signin').send({ email: `nobody-${randomUUID()}@rahasya.test`, password: 'whatever' }).expect(401);

      const first = await api().post('/admin/auth/signin').send({ email: root.email, password: root.password }).expect(200);
      await api().post('/admin/auth/signin/verify').send({ challengeId: first.body.challengeId, response: new SoftKey().assert(first.body.options) }).expect(401);
      // That challenge is spent even though the answer was wrong.
      await api().post('/admin/auth/signin/verify').send({ challengeId: first.body.challengeId, response: root.key.assert(first.body.options) }).expect(401);
      expect(await auditActions('signin')).toEqual(expect.arrayContaining(['admin.signin', 'admin.signin_key']));
    });

    it('an invite link works once, expires, and accepts only a genuine key registration', async () => {
      const owner = await inviteAdmin('Owner');
      await api().post('/admin/auth/invite/options').send({ token: owner.token }).expect(401);

      const email = `admin-${randomUUID()}@rahasya.test`;
      const invited = (await as(root).post('/admin/admins', { email, name: 'Late admin', roleId: await roleId('Admin') }).expect(201)).body;
      await as(root).post('/admin/admins', { email, name: 'Same email', roleId: await roleId('Admin') }).expect(409);
      const token = new URL(invited.inviteUrl).searchParams.get('token')!;
      const reg = await api().post('/admin/auth/invite/options').send({ token }).expect(200);
      // A registration signed over some other challenge is refused.
      const forged = new SoftKey().register({ challenge: 'not-the-challenge' });
      await api().post('/admin/auth/invite/accept').send({ token, password: 'a long enough password', challengeId: reg.body.challengeId, response: forged }).expect(401);

      await app.get(PrismaService).admin.update({ where: { id: invited.id }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });
      await api().post('/admin/auth/invite/options').send({ token }).expect(401);
    });

    it('refuses the right key answering the wrong challenge', async () => {
      const first = await api().post('/admin/auth/signin').send({ email: root.email, password: root.password }).expect(200);
      await api().post('/admin/auth/signin/verify').send({ challengeId: first.body.challengeId, response: root.key.assert({ challenge: 'stale' }) }).expect(401);
    });

    it('is reachable only from allow-listed IPs', async () => {
      try {
        process.env.ADMIN_IP_ALLOWLIST = '10.0.0.0/8';
        await as(root).get('/admin/auth/me').expect(403);
        await api().post('/admin/auth/signin').send({ email: root.email, password: root.password }).expect(403);
        process.env.ADMIN_IP_ALLOWLIST = '127.0.0.1, ::1';
        await as(root).get('/admin/auth/me').expect(200);
      } finally {
        process.env.ADMIN_IP_ALLOWLIST = '*';
      }
    });
  });

  describe('Managing users', () => {
    it('shows account metadata only', async () => {
      const user = await signUp(app);
      await api().put(`/vault/items/${randomUUID()}`).set('Authorization', user.bearer).send({ blob: fakeBlob() }).expect(200);
      const res = await as(root).get(`/admin/users?search=${encodeURIComponent(user.account.email)}`).expect(200);
      expect(res.body.users).toEqual([
        {
          id: user.session.userId,
          email: user.account.email,
          status: 'active',
          twoFactor: false,
          emergencyAccess: 'not_set_up',
          lastActiveAt: expect.any(String),
          vaultItems: 1,
        },
      ]);
      expect(res.body.summary).toMatchObject({ users: expect.any(Number), activeToday: expect.any(Number), twoStep: expect.any(Object) });
    });

    it('lock and suspend act at once; activate undoes them; every one needs a reason', async () => {
      const user = await signUp(app);
      const login = { email: user.account.email, authKey: user.account.authKey, device: user.account.device };
      await as(root).post(`/admin/users/${user.session.userId}/lock`).expect(400);
      await as(root).post(`/admin/users/${user.session.userId}/lock`, { reason: 'Reported a stolen laptop' }).expect(204);
      await api().get('/vault/sync').set('Authorization', user.bearer).expect(403);
      await api().post('/auth/login').send(login).expect(403);
      await as(root).post(`/admin/users/${user.session.userId}/activate`, { reason: 'Laptop recovered' }).expect(204);
      await api().get('/vault/sync').set('Authorization', user.bearer).expect(200);
      await as(root).post(`/admin/users/${user.session.userId}/suspend`, { reason: 'Left the company' }).expect(204);
      await api().post('/auth/login').send(login).expect(403);
      expect(await auditActions('admin')).toEqual(expect.arrayContaining(['user.lock', 'user.activate', 'user.suspend']));
    });

    it('resets two-step sign-in after an identity check', async () => {
      const user = await signUp(app);
      await api().post('/auth/2fa/setup').set('Authorization', user.bearer).expect(200);
      const prisma = app.get(PrismaService);
      const secret = unseal((await prisma.user.findUniqueOrThrow({ where: { id: user.session.userId } })).totpSecretEnc!);
      await api().post('/auth/2fa/verify').set('Authorization', user.bearer).send({ code: totp(secret, Math.floor(Date.now() / 30_000)) }).expect(200);
      const login = { email: user.account.email, authKey: user.account.authKey, device: user.account.device };
      expect((await api().post('/auth/login').send(login).expect(401)).body.twoFactorRequired).toBe(true);

      await as(root).post(`/admin/users/${user.session.userId}/reset-2fa`, { reason: 'Lost phone, verified on a call' }).expect(204);
      await api().post('/auth/login').send(login).expect(200);
    });

    it('invites people, who show as Invited until they sign up', async () => {
      const email = `invitee-${randomUUID()}@example.com`;
      await as(root).post('/admin/invites', { email }).expect(201);
      await as(root).post('/admin/invites', { email }).expect(409);
      const invited = await as(root).get(`/admin/users?filter=invited&search=${encodeURIComponent(email)}`).expect(200);
      expect(invited.body.users).toEqual([expect.objectContaining({ email, status: 'invited' })]);

      await signUp(app, email);
      const after = await as(root).get(`/admin/users?search=${encodeURIComponent(email)}`).expect(200);
      expect(after.body.users).toEqual([expect.objectContaining({ email, status: 'active' })]);
      await as(root).post('/admin/invites', { email }).expect(409);
    });

    it('filters to locked users and users without two-step sign-in', async () => {
      const user = await signUp(app);
      const q = `search=${encodeURIComponent(user.account.email)}`;
      expect((await as(root).get(`/admin/users?filter=no2fa&${q}`).expect(200)).body.users).toHaveLength(1);
      expect((await as(root).get(`/admin/users?filter=locked&${q}`).expect(200)).body.users).toHaveLength(0);
      await as(root).post(`/admin/users/${user.session.userId}/lock`, { reason: 'Investigating' }).expect(204);
      expect((await as(root).get(`/admin/users?filter=locked&${q}`).expect(200)).body.users).toEqual([expect.objectContaining({ status: 'locked' })]);
      await as(root).get('/admin/users?filter=everyone').expect(400);
    });

    it('roles decide what an admin can do', async () => {
      const auditor = await inviteAdmin('Auditor');
      const user = await signUp(app);
      await as(auditor).get('/admin/users').expect(200);
      await as(auditor).get('/admin/audit').expect(200);
      await as(auditor).post(`/admin/users/${user.session.userId}/lock`, { reason: 'Trying my luck' }).expect(403);
      await as(auditor).post('/admin/recovery', { userId: user.session.userId, reason: 'Trying my luck' }).expect(403);
      await as(auditor).post('/admin/admins', { email: 'x@rahasya.test', name: 'X', roleId: await roleId('Owner') }).expect(403);
    });
  });

  describe('Audit log', () => {
    it('records actions with their reason, verifies the chain, and exports it', async () => {
      const user = await signUp(app);
      await as(root).post(`/admin/users/${user.session.userId}/lock`, { reason: 'Suspicious sign-ins' }).expect(204);
      const entries = (await as(root).get('/admin/audit?category=admin').expect(200)).body.entries;
      expect(entries[0]).toMatchObject({ action: 'user.lock', reason: 'Suspicious sign-ins', target: { label: user.account.email }, actor: { id: root.id } });

      expect((await as(root).get('/admin/audit/verify').expect(200)).body).toMatchObject({ verified: true });
      const csv = await as(root).get('/admin/audit/export?category=admin').expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text.split('\r\n')[0]).toBe('"id","time","category","who","action","target","reason","device","ip","result","prev_hash","hash"');
    });

    it('pages back through older entries', async () => {
      const page = (await as(root).get('/admin/audit').expect(200)).body;
      if (!page.nextBefore) return; // fewer than one page so far
      const older = (await as(root).get(`/admin/audit?before=${page.nextBefore}`).expect(200)).body;
      expect(BigInt(older.entries[0].id)).toBeLessThan(BigInt(page.nextBefore));
    });

    it('refuses edits, and the chain check catches one if it ever happened', async () => {
      const prisma = app.get(PrismaService);
      const audit = app.get(AuditService);
      await expect(prisma.$executeRaw`UPDATE audit_log SET reason = 'edited' WHERE id = (SELECT max(id) FROM audit_log)`).rejects.toThrow();
      await expect(prisma.$executeRaw`DELETE FROM audit_log WHERE id = (SELECT max(id) FROM audit_log)`).rejects.toThrow();

      // Tamper inside a transaction that is rolled back, so the real log stays intact.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_change');
          await tx.$executeRaw`UPDATE audit_log SET reason = 'edited' WHERE id = (SELECT max(id) FROM audit_log)`;
          expect(await audit.verify(tx)).toMatchObject({ verified: false });
          throw new Error('roll back');
        }),
      ).rejects.toThrow('roll back');
      expect(await audit.verify()).toMatchObject({ verified: true });
    });

    it('keeps the chain intact under parallel writes', async () => {
      const audit = app.get(AuditService);
      await Promise.all(
        Array.from({ length: 10 }, (_, i) => audit.record({ actor: { type: 'system', label: 'System' }, action: 'test.parallel', category: 'admin', result: String(i) })),
      );
      expect(await audit.verify()).toMatchObject({ verified: true });
    });
  });

  describe('Emergency recovery', () => {
    const sealedKey = () => b64(SEALED_KEY_BYTES);

    it('runs end to end: opt in, request, confirm with a key, wait, recover, new master password', async () => {
      const user = await signUp(app);
      const userId = user.session.userId;
      await as(root).post('/admin/recovery', { userId, reason: 'Lost phone and password' }).expect(400); // not opted in

      expect((await api().get('/recovery/public-key').set('Authorization', user.bearer).expect(200)).body.publicKey).toBeTruthy();
      const sealed = sealedKey();
      await api().put('/account/recovery').set('Authorization', user.bearer).send({ sealedKey: sealed }).expect(204);
      const listed = await as(root).get(`/admin/users?search=${encodeURIComponent(user.account.email)}`).expect(200);
      expect(listed.body.users[0].emergencyAccess).toBe('opted_in');

      const request1 = await as(root).post('/admin/recovery', { userId, reason: 'Lost phone and password, confirmed on a call' }).expect(201);
      const id = request1.body.id;
      expect(request1.body).toMatchObject({ status: 'pending', requestedBy: { id: root.id } });
      await as(root).post('/admin/recovery', { userId, reason: 'Second request' }).expect(409);
      expect((await api().get('/recovery').set('Authorization', user.bearer).expect(200)).body).toEqual([expect.objectContaining({ id, status: 'pending' })]);

      // Confirming needs a fresh touch of this admin's own key.
      const stranger = await stepUp(app, root);
      await as(root).post(`/admin/recovery/${id}/confirm`, { challengeId: stranger.challengeId, response: new SoftKey().assert({ challenge: 'x' }) }).expect(401);
      const confirmed = await as(root).post(`/admin/recovery/${id}/confirm`, await stepUp(app, root)).expect(200);
      expect(confirmed.body.status).toBe('confirmed');
      expect(new Date(confirmed.body.availableAt).getTime() - Date.now()).toBeGreaterThan(47 * 3600_000);

      await as(root).get(`/admin/recovery/${id}/package`).expect(409); // still waiting
      await app.get(PrismaService).recoveryRequest.update({ where: { id }, data: { availableAt: new Date(Date.now() - 1000) } });
      expect((await as(root).get(`/admin/recovery/${id}/package`).expect(200)).body.sealedKey).toBe(sealed);

      const fresh = { authKey: b64(32), kdfSalt: b64(16), kdfParams: user.account.kdfParams, wrappedVaultKey: fakeBlob(32) };
      await as(root).post(`/admin/recovery/${id}/complete`, fresh).expect(204);
      await as(root).post(`/admin/recovery/${id}/complete`, fresh).expect(409);

      await api().get('/vault/sync').set('Authorization', user.bearer).expect(401); // every session signed out
      const login = { email: user.account.email, device: user.account.device };
      await api().post('/auth/login').send({ ...login, authKey: user.account.authKey }).expect(401);
      expect((await api().post('/auth/login').send({ ...login, authKey: fresh.authKey }).expect(200)).body.wrappedVaultKey).toBe(fresh.wrappedVaultKey);

      expect((await as(root).get(`/admin/recovery/${id}`).expect(200)).body.status).toBe('used');
      expect(await auditActions('emergency')).toEqual(
        expect.arrayContaining(['recovery.request', 'recovery.confirm', 'recovery.wait_started', 'recovery.package', 'recovery.complete']),
      );
    });

    it('the user can cancel during the wait, and turning recovery off cancels too', async () => {
      const user = await signUp(app);
      const userId = user.session.userId;
      await api().put('/account/recovery').set('Authorization', user.bearer).send({ sealedKey: sealedKey() }).expect(204);

      const first = (await as(root).post('/admin/recovery', { userId, reason: 'Lost phone' }).expect(201)).body.id;
      await as(root).post(`/admin/recovery/${first}/confirm`, await stepUp(app, root)).expect(200);
      await api().post(`/recovery/${first}/cancel`).set('Authorization', user.bearer).expect(200);
      await app.get(PrismaService).recoveryRequest.update({ where: { id: first }, data: { availableAt: new Date(Date.now() - 1000) } });
      await as(root).get(`/admin/recovery/${first}/package`).expect(409);

      const second = (await as(root).post('/admin/recovery', { userId, reason: 'Asked again' }).expect(201)).body.id;
      await api().delete('/account/recovery').set('Authorization', user.bearer).expect(204);
      expect((await as(root).get(`/admin/recovery/${second}`).expect(200)).body).toMatchObject({ status: 'cancelled', cancelledBy: 'user' });
      const other = await signUp(app);
      await api().post(`/recovery/${second}/cancel`).set('Authorization', other.bearer).expect(404);
    });

    it('an admin can cancel a request with a reason', async () => {
      const user = await signUp(app);
      await api().put('/account/recovery').set('Authorization', user.bearer).send({ sealedKey: sealedKey() }).expect(204);
      const id = (await as(root).post('/admin/recovery', { userId: user.session.userId, reason: 'Wrong person' }).expect(201)).body.id;
      await as(root).post(`/admin/recovery/${id}/cancel`, { reason: 'Filed for the wrong user' }).expect(200);
      expect((await as(root).get('/admin/recovery?status=all').expect(200)).body.find((r: { id: string }) => r.id === id).status).toBe('cancelled');
    });
  });

  describe('Admins and roles', () => {
    it("nobody can change, suspend or remove the super admin, and the attempt is logged", async () => {
      const owner = await inviteAdmin('Owner');
      await as(owner).patch(`/admin/admins/${root.id}`, { roleId: await roleId('Auditor'), reason: 'Demote' }).expect(403);
      await as(owner).patch(`/admin/admins/${root.id}`, { status: 'SUSPENDED', reason: 'Suspend' }).expect(403);
      await as(owner).delete(`/admin/admins/${root.id}`, { reason: 'Remove' }).expect(403);
      const denied = (await as(root).get('/admin/audit?category=admin').expect(200)).body.entries.filter(
        (e: { result: string; actor: { id: string } }) => e.result === 'denied' && e.actor.id === owner.id,
      );
      expect(denied.map((e: { action: string }) => e.action)).toEqual(['admin.remove', 'admin.update', 'admin.update']);
    });

    it('Owners manage admins and custom roles; built-in roles stay fixed', async () => {
      const owner = await inviteAdmin('Owner');
      const name = `Helpdesk ${randomUUID().slice(0, 8)}`;
      const role = (await as(owner).post('/admin/roles', { name, permissions: ['users.view', 'users.manage'] }).expect(201)).body;
      await as(owner).post('/admin/roles', { name, permissions: ['users.view'] }).expect(409);
      await as(owner).post('/admin/roles', { name: 'Bad', permissions: ['vault.read'] }).expect(400);
      await as(owner).patch(`/admin/roles/${await roleId('Owner')}`, { permissions: ['users.view'] }).expect(403);
      await as(owner).patch(`/admin/roles/${role.id}`, { permissions: ['users.view'] }).expect(204);
      const roles = (await as(owner).get('/admin/roles').expect(200)).body;
      expect(roles.map((r: { name: string }) => r.name)).toEqual(expect.arrayContaining(['Owner', 'Admin', 'Auditor', name]));
      expect(roles.find((r: { name: string }) => r.name === name)).toMatchObject({ builtIn: false, permissions: ['users.view'] });

      const email = `helpdesk-${randomUUID()}@rahasya.test`;
      const invited = (await as(owner).post('/admin/admins', { email, name: 'Kavya Iyer', roleId: role.id }).expect(201)).body;
      const list = (await as(owner).get('/admin/admins').expect(200)).body;
      expect(list.find((a: { id: string }) => a.id === invited.id)).toMatchObject({ status: 'invited', keyStatus: 'pending', role: { name } });
      expect(list.find((a: { id: string }) => a.id === owner.id).you).toBe(true);

      const helpdesk = await acceptInvite(app, invited.inviteUrl, email);
      await as(helpdesk).get('/admin/users').expect(200);
      await as(helpdesk).post('/admin/invites', { email: `x-${randomUUID()}@example.com` }).expect(403); // users.manage removed
      await as(owner).patch(`/admin/admins/${helpdesk.id}`, { status: 'SUSPENDED', reason: 'Offboarding' }).expect(204);
      await as(helpdesk).get('/admin/users').expect(401);
      await as(owner).delete(`/admin/admins/${helpdesk.id}`, { reason: 'Offboarded' }).expect(204);
    });

    it('break-glass can freeze the super admin and reset a lost key, never delete', async () => {
      const admins = app.get(AdminsService);
      await admins.breakGlass(root.email, 'freeze');
      await as(root).get('/admin/auth/me').expect(401);
      await api().post('/admin/auth/signin').send({ email: root.email, password: root.password }).expect(403);
      await admins.breakGlass(root.email, 'unfreeze');
      root = { ...root, ...(await adminSignIn(app, root.email, root.password, root.key)) };

      const { inviteUrl } = (await admins.breakGlass(root.email, 'reset-keys')) as { inviteUrl: string };
      await api().post('/admin/auth/signin').send({ email: root.email, password: root.password }).expect(403); // waiting for a new key
      root = await acceptInvite(app, inviteUrl, root.email);
      expect((await as(root).get('/admin/auth/me').expect(200)).body.isSuper).toBe(true);
      await expect(admins.createSuperAdmin(`second-${randomUUID()}@rahasya.test`, 'Second')).rejects.toThrow('already exists');
    });

    // Last: it moves the super admin role to someone else.
    it('only the super admin hands over the role, with their own key, and becomes an Owner', async () => {
      const owner = await inviteAdmin('Owner');
      await as(owner).post('/admin/super/handover', { adminId: owner.id, ...(await stepUp(app, owner)) }).expect(403);
      await as(root).post('/admin/super/handover', { adminId: owner.id, challengeId: randomUUID(), response: owner.key.assert({ challenge: 'x' }) }).expect(401);
      await as(root).post('/admin/super/handover', { adminId: owner.id, ...(await stepUp(app, root)) }).expect(204);

      expect((await as(owner).get('/admin/auth/me').expect(200)).body).toMatchObject({ isSuper: true });
      expect((await as(root).get('/admin/auth/me').expect(200)).body).toMatchObject({ isSuper: false, role: 'Owner' });
      expect(await app.get(PrismaService).admin.count({ where: { isSuper: true } })).toBe(1);
    });
  });
});
