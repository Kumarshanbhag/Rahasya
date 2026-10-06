import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CRYPTO } from '@rahasya/config';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { AdminsService } from '../src/admin/admins.service';
import { AppModule } from '../src/app.module';
import { setup } from '../src/main';
import { PrismaService } from '../src/prisma.service';
import { SoftKey } from './soft-key';

export async function createApp({ throttle = false } = {}) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!throttle) builder = builder.overrideGuard(ThrottlerGuard).useValue({ canActivate: () => true });
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>();
  await setup(app).listen(0); // bound once, so parallel supertest calls share one server
  return app;
}

export const b64 = (length: number) => randomBytes(length).toString('base64');

/** Shaped like packages/crypto output (version · algorithm · nonce · ciphertext · tag); the API can't tell the difference. */
export const fakeBlob = (plainBytes = 64) =>
  Buffer.concat([Buffer.from([CRYPTO.version, CRYPTO.algXChaCha20Poly1305]), randomBytes(CRYPTO.nonceBytes + plainBytes + CRYPTO.tagBytes)]).toString('base64');

export function newAccount() {
  return {
    email: `user-${randomUUID()}@example.com`,
    authKey: b64(CRYPTO.keyBytes),
    kdfSalt: b64(CRYPTO.saltBytes),
    kdfParams: { ...CRYPTO.argon2 },
    wrappedVaultKey: fakeBlob(CRYPTO.keyBytes),
    device: { name: 'Pixel 8', platform: 'android' },
  };
}

export type Session = Awaited<ReturnType<typeof signUp>>;

export async function signUp(app: NestExpressApplication, email?: string) {
  const account = { ...newAccount(), ...(email && { email }) };
  const res = await request(app.getHttpServer()).post('/auth/register').send(account).expect(201);
  return { account, session: res.body, bearer: `Bearer ${res.body.accessToken}` };
}

export type AdminSession = Awaited<ReturnType<typeof acceptInvite>>;

/** Opens an admin invite link: registers a fresh security key, sets a password, signs in. */
export async function acceptInvite(app: NestExpressApplication, inviteUrl: string, email: string) {
  const api = () => request(app.getHttpServer());
  const token = new URL(inviteUrl).searchParams.get('token')!;
  const key = new SoftKey();
  const password = `pw-${randomUUID()}`;
  const reg = await api().post('/admin/auth/invite/options').send({ token }).expect(200);
  await api().post('/admin/auth/invite/accept').send({ token, password, challengeId: reg.body.challengeId, response: key.register(reg.body.options) }).expect(204);
  const session = await adminSignIn(app, email, password, key);
  return { ...session, email, password, key, token };
}

export async function adminSignIn(app: NestExpressApplication, email: string, password: string, key: SoftKey) {
  const api = () => request(app.getHttpServer());
  const first = await api().post('/admin/auth/signin').send({ email, password }).expect(200);
  const res = await api().post('/admin/auth/signin/verify').send({ challengeId: first.body.challengeId, response: key.assert(first.body.options) }).expect(200);
  return { id: res.body.admin.id as string, bearer: `Bearer ${res.body.accessToken}` };
}

/** The one super admin: created on the first run, rescued with break-glass on later runs (the test database is never wiped). */
export async function superAdmin(app: NestExpressApplication) {
  const existing = await app.get(PrismaService).admin.findFirst({ where: { isSuper: true } });
  const admins = app.get(AdminsService);
  const { email, inviteUrl } = existing
    ? ((await admins.breakGlass(existing.email, 'reset-keys')) as { email: string; inviteUrl: string })
    : await admins.createSuperAdmin(`super-${randomUUID()}@rahasya.test`, 'Arjun Mehta');
  return acceptInvite(app, inviteUrl, email);
}

/** A fresh security-key touch from this admin, for step-up actions. */
export async function stepUp(app: NestExpressApplication, admin: AdminSession) {
  const res = await request(app.getHttpServer()).post('/admin/auth/step-up').set('Authorization', admin.bearer).expect(200);
  return { challengeId: res.body.challengeId as string, response: admin.key.assert(res.body.options) };
}
