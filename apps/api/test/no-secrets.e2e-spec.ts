import { ConsoleLogger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { b64, createApp, fakeBlob, signUp } from './helpers';

/**
 * Spec testing gate: no secret, key or plaintext reaches the logs. Runs the flows that handle secrets, including
 * failures, while capturing everything the API writes, then checks none of those values appear in it.
 */
describe('Nothing secret reaches the logs', () => {
  let app: NestExpressApplication;
  const written: string[] = [];
  const capture = (stream: NodeJS.WriteStream) =>
    jest.spyOn(stream, 'write').mockImplementation((chunk: string | Uint8Array) => {
      written.push(String(chunk));
      return true;
    });

  beforeAll(async () => {
    app = await createApp();
    // The testing module only prints errors; log every level so nothing slips past unseen.
    app.useLogger(new ConsoleLogger({ logLevels: ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'] }));
  });
  afterAll(() => app.close());

  it('keeps keys, tokens, blobs and two-step secrets out of stdout and stderr', async () => {
    const out = [capture(process.stdout), capture(process.stderr), jest.spyOn(console, 'log'), jest.spyOn(console, 'error'), jest.spyOn(console, 'warn')];
    const api = () => request(app.getHttpServer());
    const secrets: string[] = [];
    try {
      const user = await signUp(app);
      const { account, session } = user;
      const blob = fakeBlob();
      secrets.push(account.authKey, account.wrappedVaultKey, account.kdfSalt, session.accessToken, session.refreshToken, blob);

      const wrongKey = b64(32);
      secrets.push(wrongKey);
      await api().post('/auth/login').send({ email: account.email, authKey: wrongKey, device: account.device }).expect(401);
      await api().post('/auth/register').send({ ...account, wrappedVaultKey: 'not base64!' }).expect(400);
      await api().put(`/vault/items/${randomUUID()}`).set('Authorization', user.bearer).send({ blob }).expect(200);
      await api().put(`/vault/items/${randomUUID()}`).set('Authorization', user.bearer).send({ blob: Buffer.from('plaintext password').toString('base64') }).expect(400);
      const twoStep = await api().post('/auth/2fa/setup').set('Authorization', user.bearer).expect(200);
      secrets.push(twoStep.body.secret);
      const next = await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200);
      secrets.push(next.body.refreshToken, next.body.accessToken);
      await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401); // reuse
    } finally {
      out.forEach((spy) => spy.mockRestore());
    }
    const calls = out.flatMap((spy) => spy.mock.calls.flat().map(String));
    const everything = [...written, ...calls].join('\n');
    for (const secret of secrets) expect(everything).not.toContain(secret);
  });
});
