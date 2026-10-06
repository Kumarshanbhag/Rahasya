import { ApiError, createApiClient } from './index';

function respond(status: number, body?: unknown) {
  return jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
}

const device = { name: 'Pixel 8', platform: 'android' as const };
const session = { userId: 'u1', deviceId: 'd1', wrappedVaultKey: 'AQE=', accessToken: 'jwt', refreshToken: 'r'.repeat(43), expiresIn: 900 };

it('asks for the salt and key-derivation settings before deriving keys', async () => {
  const fetch = respond(200, { kdfSalt: 'c2FsdA==', kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1 } });
  const api = createApiClient({ baseUrl: 'https://api.test/', fetch });
  expect(await api.prelogin('priya@example.com')).toEqual({ kdfSalt: 'c2FsdA==', kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1 } });
  expect(fetch).toHaveBeenCalledWith('https://api.test/auth/prelogin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'priya@example.com' }),
  });
});

it('registers and signs in, returning the session', async () => {
  const fetch = respond(201, session);
  const api = createApiClient({ baseUrl: 'https://api.test', fetch });
  const body = { email: 'priya@example.com', authKey: 'a', kdfSalt: 's', kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1 }, wrappedVaultKey: 'w', device };
  expect(await api.register(body)).toEqual(session);
  expect(fetch.mock.calls[0][0]).toBe('https://api.test/auth/register');
});

it('sends the access token on calls that need a session', async () => {
  const fetch = respond(204);
  const api = createApiClient({ baseUrl: 'https://api.test', fetch });
  await api.logout('jwt');
  expect(fetch).toHaveBeenCalledWith('https://api.test/auth/logout', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer jwt' }) }));
});

it('turns a wrong master password into an error with the tries left', async () => {
  const api = createApiClient({ baseUrl: 'https://api.test', fetch: respond(401, { message: 'Incorrect master password', triesLeft: 3 }) });
  const error = await api.login({ email: 'priya@example.com', authKey: 'a', device }).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ status: 401, message: 'Incorrect master password', triesLeft: 3 });
});

it('reports when a two-step code is needed', async () => {
  const api = createApiClient({ baseUrl: 'https://api.test', fetch: respond(401, { message: 'Enter your two-step code', triesLeft: 4, twoFactorRequired: true }) });
  await expect(api.login({ email: 'priya@example.com', authKey: 'a', device })).rejects.toMatchObject({ twoFactorRequired: true });
});

it('reports how long to wait after too many tries', async () => {
  const api = createApiClient({ baseUrl: 'https://api.test', fetch: respond(429, { message: 'Too many attempts. Try again shortly.', retryAfterMs: 27000 }) });
  await expect(api.login({ email: 'priya@example.com', authKey: 'a', device })).rejects.toMatchObject({ status: 429, retryAfterMs: 27000 });
});

it('explains a lost connection in words a person understands', async () => {
  const api = createApiClient({ baseUrl: 'https://api.test', fetch: jest.fn().mockRejectedValue(new TypeError('Network request failed')) });
  await expect(api.prelogin('priya@example.com')).rejects.toMatchObject({ status: 0, message: "Can't reach Rahasya. Check your connection and try again." });
});

it('shows validation errors as one readable sentence', async () => {
  const api = createApiClient({ baseUrl: 'https://api.test', fetch: respond(400, { message: ['email must be an email'], error: 'Bad Request' }) });
  await expect(api.prelogin('nope')).rejects.toMatchObject({ status: 400, message: 'email must be an email' });
});
