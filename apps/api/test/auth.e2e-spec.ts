import type { NestExpressApplication } from '@nestjs/platform-express';
import { CRYPTO, LOCKOUT, SESSION } from '@rahasya/config';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { AUTH_RATE_LIMIT } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { totp, unseal } from '../src/auth/two-factor';
import { PrismaService } from '../src/prisma.service';
import { b64, createApp, fakeBlob, newAccount, signUp } from './helpers';

describe('Sign up, sign in and sessions', () => {
  let app: NestExpressApplication;
  const api = () => request(app.getHttpServer());
  const login = (body: object) => api().post('/auth/login').send(body);

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(() => app.close());

  it('creates an account and starts a session', async () => {
    const { account, session } = await signUp(app);
    expect(session).toMatchObject({
      userId: expect.any(String),
      deviceId: expect.any(String),
      wrappedVaultKey: account.wrappedVaultKey,
      expiresIn: SESSION.accessTtlSec,
    });
    expect(session.refreshToken).toHaveLength(43);
  });

  it('refuses a second account for the same email, whatever the case', async () => {
    const { account } = await signUp(app);
    await api().post('/auth/register').send({ ...newAccount(), email: account.email.toUpperCase() }).expect(409);
  });

  it.each([
    ['a short authKey', { authKey: b64(16) }],
    ['a wrapped key without the ciphertext header', { wrappedVaultKey: Buffer.alloc(74).toString('base64') }],
    ['multi-lane Argon2id', { kdfParams: { ...CRYPTO.argon2, parallelism: 2 } }],
    ['Argon2id memory under the 32 MB floor', { kdfParams: { ...CRYPTO.argon2, memoryKiB: 16 * 1024 } }],
    ['a plaintext master password', { masterPassword: 'correct horse battery staple' }],
  ])('refuses %s', async (_, patch) => {
    await api().post('/auth/register').send({ ...newAccount(), ...patch }).expect(400);
  });

  it('prelogin returns the stored salt, and a stable fake one for unknown emails', async () => {
    const { account } = await signUp(app);
    const known = await api().post('/auth/prelogin').send({ email: account.email }).expect(200);
    expect(known.body).toEqual({ kdfSalt: account.kdfSalt, kdfParams: account.kdfParams });

    const first = await api().post('/auth/prelogin').send({ email: 'nobody@example.com' }).expect(200);
    const again = await api().post('/auth/prelogin').send({ email: 'nobody@example.com' }).expect(200);
    expect(first.body).toEqual(again.body);
    expect(Buffer.from(first.body.kdfSalt, 'base64')).toHaveLength(CRYPTO.saltBytes);
  });

  it('signs in with the right authKey and hands back the wrapped vault key', async () => {
    const { account } = await signUp(app);
    const res = await login({ email: account.email, authKey: account.authKey, device: account.device }).expect(200);
    expect(res.body.wrappedVaultKey).toBe(account.wrappedVaultKey);
  });

  it('counts down tries, then makes the account wait 30 s', async () => {
    const { account } = await signUp(app);
    const wrong = { email: account.email, authKey: b64(32), device: account.device };
    for (let left = LOCKOUT.maxTries - 1; left >= 0; left--) {
      const res = await login(wrong).expect(401);
      expect(res.body.triesLeft).toBe(left);
    }
    const waiting = await login({ ...wrong, authKey: account.authKey }).expect(429);
    expect(waiting.body.retryAfterMs).toBeGreaterThan(LOCKOUT.waitMs - 5000);

    // Once the wait is over the right key works again.
    await app.get(PrismaService).user.update({ where: { email: account.email }, data: { lockedUntil: new Date(Date.now() - 1) } });
    await login({ ...wrong, authKey: account.authKey }).expect(200);
  });

  it('never allows more than 5 guesses, even in parallel', async () => {
    const { account } = await signUp(app);
    const wrong = { email: account.email, authKey: b64(32), device: account.device };
    const statuses = (await Promise.all(Array.from({ length: 12 }, () => login(wrong)))).map((r) => r.status);
    expect(statuses.filter((s) => s === 401)).toHaveLength(LOCKOUT.maxTries);
    expect(statuses.filter((s) => s === 429)).toHaveLength(12 - LOCKOUT.maxTries);
  });

  it('rotates refresh tokens, and signs the device out when an old one comes back', async () => {
    const { session } = await signUp(app);
    const next = await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200);
    await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await api().post('/auth/refresh').send({ refreshToken: next.body.refreshToken }).expect(401);
    await api().get('/devices').set('Authorization', `Bearer ${next.body.accessToken}`).expect(401);
  });

  it('gives an unknown email the same answer as a wrong key', async () => {
    const res = await login({ email: `nobody-${Date.now()}@example.com`, authKey: b64(32), device: { name: 'Pixel 8', platform: 'android' } }).expect(401);
    expect(res.body.message).toBe('Incorrect email or master password');
  });

  it('refuses an expired refresh token, and the hourly job deletes it', async () => {
    const { session } = await signUp(app);
    const prisma = app.get(PrismaService);
    const tokenHash = createHash('sha256').update(session.refreshToken).digest('hex');
    await prisma.refreshToken.update({ where: { tokenHash }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await app.get(AuthService).dropExpiredTokens();
    expect(await prisma.refreshToken.count({ where: { tokenHash } })).toBe(0);
  });

  it('sign out ends the session', async () => {
    const { bearer } = await signUp(app);
    await api().post('/auth/logout').set('Authorization', bearer).expect(204);
    await api().get('/devices').set('Authorization', bearer).expect(401);
  });

  it('turns on two-step sign-in, then asks for a fresh code at every sign-in', async () => {
    const { account, session, bearer } = await signUp(app);
    const setupRes = await api().post('/auth/2fa/setup').set('Authorization', bearer).expect(200);
    expect(setupRes.body.otpauthUrl).toContain(`secret=${setupRes.body.secret}`);

    const user = await app.get(PrismaService).user.findUniqueOrThrow({ where: { id: session.userId } });
    const secret = unseal(user.totpSecretEnc!);
    const step = Math.floor(Date.now() / 30_000);
    const used = totp(secret, step);
    await api().post('/auth/2fa/verify').set('Authorization', bearer).send({ code: used === '000000' ? '111111' : '000000' }).expect(400);
    await api().post('/auth/2fa/verify').set('Authorization', bearer).send({ code: used }).expect(200);

    const creds = { email: account.email, authKey: account.authKey, device: account.device };
    expect((await login(creds).expect(401)).body.twoFactorRequired).toBe(true);
    await login({ ...creds, totpCode: used }).expect(401); // already used to turn it on
    await login({ ...creds, totpCode: totp(secret, step + 1) }).expect(200);
  });

  it('lists devices and signs out a lost one', async () => {
    const { account, bearer } = await signUp(app);
    const laptop = await login({ email: account.email, authKey: account.authKey, device: { name: 'Laptop', platform: 'web' } }).expect(200);

    const list = await api().get('/devices').set('Authorization', bearer).expect(200);
    expect(list.body.map((d: { name: string; current: boolean }) => [d.name, d.current])).toEqual(
      expect.arrayContaining([['Pixel 8', true], ['Laptop', false]]),
    );
    await api().delete(`/devices/${laptop.body.deviceId}`).set('Authorization', bearer).expect(204);
    await api().get('/devices').set('Authorization', `Bearer ${laptop.body.accessToken}`).expect(401);
  });

  it('signing in again from a known device reuses it', async () => {
    const { account, session } = await signUp(app);
    const again = await login({ email: account.email, authKey: account.authKey, device: { ...account.device, id: session.deviceId } }).expect(200);
    expect(again.body.deviceId).toBe(session.deviceId);
    await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await api().get('/devices').set('Authorization', `Bearer ${again.body.accessToken}`).expect(200);
  });

  it('changes the master password: new key works, old one fails, other devices signed out', async () => {
    const { account, bearer } = await signUp(app);
    const laptop = await login({ email: account.email, authKey: account.authKey, device: { name: 'Laptop', platform: 'web' } }).expect(200);
    const next = { authKey: b64(32), kdfSalt: b64(16), kdfParams: account.kdfParams, wrappedVaultKey: fakeBlob(32) };

    await api().post('/account/rotate-key').set('Authorization', bearer).send({ ...next, currentAuthKey: b64(32) }).expect(401);
    await api().post('/account/rotate-key').set('Authorization', bearer).send({ ...next, currentAuthKey: account.authKey }).expect(204);

    await api().get('/devices').set('Authorization', bearer).expect(200);
    await api().get('/devices').set('Authorization', `Bearer ${laptop.body.accessToken}`).expect(401);
    await login({ email: account.email, authKey: account.authKey, device: account.device }).expect(401);
    const res = await login({ email: account.email, authKey: next.authKey, device: account.device }).expect(200);
    expect(res.body.wrappedVaultKey).toBe(next.wrappedVaultKey);
    expect((await api().post('/auth/prelogin').send({ email: account.email })).body.kdfSalt).toBe(next.kdfSalt);
  });
});

describe('IP rate limits', () => {
  it('throttles the auth endpoints per IP', async () => {
    const app = await createApp({ throttle: true });
    const statuses: number[] = [];
    for (let i = 0; i <= AUTH_RATE_LIMIT.limit; i++) {
      statuses.push((await request(app.getHttpServer()).post('/auth/prelogin').send({ email: 'x@example.com' })).status);
    }
    expect(statuses.slice(0, AUTH_RATE_LIMIT.limit).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    await app.close();
  });
});
