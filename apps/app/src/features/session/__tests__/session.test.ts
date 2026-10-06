import { ApiError, type ApiClient } from '@rahasya/api-client';
import { CRYPTO, LOCKOUT, WRAPPED_KEY_BYTES } from '@rahasya/config';
import { createAccountKeys, fromBase64, ready, toBase64 } from '@rahasya/crypto';
import type { SavedAccount } from '../device-store.types';
import { createSession, UnlockFailed } from '../session';

const FAST = { memoryKiB: CRYPTO.argon2Min.memoryKiB, iterations: 1, parallelism: 1 };
const PASSWORD = 'orbit candle mango thunder';
const device = { name: 'Pixel 8', platform: 'android' as const };
const tokens = { userId: 'u1', deviceId: 'd1', accessToken: 'jwt', refreshToken: 'r'.repeat(43), expiresIn: 900 };

function fakeDevice(saved: SavedAccount | null = null) {
  let value = saved;
  return {
    read: jest.fn(async () => value),
    save: jest.fn(async (a: SavedAccount) => void (value = a)),
    forget: jest.fn(async () => void (value = null)),
  };
}

function fakeApi(overrides: Partial<ApiClient> = {}): jest.Mocked<ApiClient> {
  return {
    prelogin: jest.fn(),
    register: jest.fn(async (body) => ({ ...tokens, wrappedVaultKey: body.wrappedVaultKey })),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(async () => undefined),
    ...overrides,
  } as jest.Mocked<ApiClient>;
}

/** An account that already exists on the server, as sign-in would find it. */
function existingAccount() {
  const keys = createAccountKeys(PASSWORD, FAST);
  const saved: SavedAccount = {
    email: 'priya@example.com',
    ...tokens,
    kdfSalt: toBase64(keys.kdfSalt),
    kdfParams: FAST,
    wrappedVaultKey: toBase64(keys.wrappedVaultKey),
  };
  return { keys, saved };
}

beforeAll(() => ready());

describe('starting the app', () => {
  it('a device with no account is signed out', async () => {
    const session = createSession({ api: fakeApi(), device: fakeDevice(), deviceInfo: device, kdfParams: FAST });
    await session.getState().load();
    expect(session.getState().status).toBe('signed-out');
  });

  it('a device that was signed in starts locked, waiting for the master password', async () => {
    const session = createSession({ api: fakeApi(), device: fakeDevice(existingAccount().saved), deviceInfo: device, kdfParams: FAST });
    await session.getState().load();
    expect(session.getState()).toMatchObject({ status: 'locked', email: 'priya@example.com' });
  });
});

describe('creating an account', () => {
  it('derives keys on the device and sends only the derived values, never the password', async () => {
    const api = fakeApi();
    const store = fakeDevice();
    const session = createSession({ api, device: store, deviceInfo: device, kdfParams: FAST });
    await session.getState().signUp('Priya@Example.com', PASSWORD);

    const body = api.register.mock.calls[0]![0];
    expect(JSON.stringify(api.register.mock.calls)).not.toContain(PASSWORD);
    expect(body).toMatchObject({ email: 'priya@example.com', kdfParams: FAST, device });
    expect(fromBase64(body.authKey)).toHaveLength(CRYPTO.keyBytes);
    expect(fromBase64(body.wrappedVaultKey)).toHaveLength(WRAPPED_KEY_BYTES);
    expect(session.getState().status).toBe('unlocked');
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'priya@example.com', accessToken: 'jwt' }));
  });
});

describe('signing in on a new device', () => {
  it('fetches the salt, proves the password with the auth key and opens the vault key', async () => {
    const { keys, saved } = existingAccount();
    const api = fakeApi({
      prelogin: jest.fn(async () => ({ kdfSalt: saved.kdfSalt, kdfParams: FAST })),
      login: jest.fn(async () => ({ ...tokens, wrappedVaultKey: saved.wrappedVaultKey })),
    });
    const session = createSession({ api, device: fakeDevice(), deviceInfo: device, kdfParams: FAST });
    await session.getState().signIn('priya@example.com', PASSWORD, '123456');

    expect(api.login).toHaveBeenCalledWith({ email: 'priya@example.com', authKey: toBase64(keys.authKey), totpCode: '123456', device });
    expect(session.getState().status).toBe('unlocked');
    expect(toBase64(session.getState().vaultKey!)).toBe(toBase64(keys.vaultKey));
  });

  it('passes the server’s answer on when the password is wrong, and stays signed out', async () => {
    const { saved } = existingAccount();
    const api = fakeApi({
      prelogin: jest.fn(async () => ({ kdfSalt: saved.kdfSalt, kdfParams: FAST })),
      login: jest.fn(async () => Promise.reject(new ApiError(401, 'Incorrect master password', { triesLeft: 4 }))),
    });
    const session = createSession({ api, device: fakeDevice(), deviceInfo: device, kdfParams: FAST });
    await session.getState().load();
    await expect(session.getState().signIn('priya@example.com', 'wrong password!!', undefined)).rejects.toMatchObject({ triesLeft: 4 });
    expect(session.getState().status).toBe('signed-out');
  });
});

describe('unlocking on this device', () => {
  async function lockedSession(now = () => Date.now()) {
    const session = createSession({ api: fakeApi(), device: fakeDevice(existingAccount().saved), deviceInfo: device, kdfParams: FAST, now });
    await session.getState().load();
    return session;
  }

  it('opens the vault offline with the right master password', async () => {
    const session = await lockedSession();
    await session.getState().unlock(PASSWORD);
    expect(session.getState().status).toBe('unlocked');
  });

  it('counts down the tries left, then makes the user wait 30 s', async () => {
    let clock = 1_000_000;
    const session = await lockedSession(() => clock);
    for (let left = LOCKOUT.maxTries - 1; left >= 0; left--) {
      await expect(session.getState().unlock('wrong password!!')).rejects.toMatchObject({ triesLeft: left });
    }
    const waiting = await session.getState().unlock(PASSWORD).catch((e: unknown) => e);
    expect(waiting).toBeInstanceOf(UnlockFailed);
    expect(waiting).toMatchObject({ retryAfterMs: LOCKOUT.waitMs });
    expect(session.getState().status).toBe('locked');

    clock += LOCKOUT.waitMs;
    await session.getState().unlock(PASSWORD);
    expect(session.getState().status).toBe('unlocked');
  });

  it('locking forgets the vault key', async () => {
    const session = await lockedSession();
    await session.getState().unlock(PASSWORD);
    session.getState().lock();
    expect(session.getState()).toMatchObject({ status: 'locked', vaultKey: undefined });
  });
});

it('signing out ends the server session and forgets this device', async () => {
  const api = fakeApi();
  const store = fakeDevice(existingAccount().saved);
  const session = createSession({ api, device: store, deviceInfo: device, kdfParams: FAST });
  await session.getState().load();
  await session.getState().signOut();
  expect(api.logout).toHaveBeenCalledWith('jwt');
  expect(store.forget).toHaveBeenCalled();
  expect(session.getState().status).toBe('signed-out');
});

describe('calling the API with the session', () => {
  async function signedIn(api: jest.Mocked<ApiClient>, store = fakeDevice(existingAccount().saved)) {
    const session = createSession({ api, device: store, deviceInfo: device, kdfParams: FAST });
    await session.getState().load();
    return { session, store };
  }
  const expired = () => Promise.reject(new ApiError(401, 'Unauthorized'));

  it('sends the current access token', async () => {
    const { session } = await signedIn(fakeApi());
    const call = jest.fn(async (token: string) => token);
    expect(await session.getState().authorized(call)).toBe('jwt');
  });

  it('refreshes an expired token once, saves the new ones and retries', async () => {
    const api = fakeApi({ refresh: jest.fn(async () => ({ accessToken: 'jwt-2', refreshToken: 'n'.repeat(43), expiresIn: 900 })) });
    const { session, store } = await signedIn(api);
    const call = jest.fn((token: string) => (token === 'jwt' ? expired() : Promise.resolve('ok')));
    expect(await session.getState().authorized(call)).toBe('ok');
    expect(api.refresh).toHaveBeenCalledWith('r'.repeat(43));
    expect(call).toHaveBeenLastCalledWith('jwt-2');
    expect(store.save).toHaveBeenLastCalledWith(expect.objectContaining({ accessToken: 'jwt-2', refreshToken: 'n'.repeat(43) }));
  });

  it('shares one refresh between calls that expire together, because a refresh token works only once', async () => {
    const api = fakeApi({ refresh: jest.fn(async () => ({ accessToken: 'jwt-2', refreshToken: 'n'.repeat(43), expiresIn: 900 })) });
    const { session } = await signedIn(api);
    const call = (token: string) => (token === 'jwt' ? expired() : Promise.resolve(token));
    await Promise.all([session.getState().authorized(call), session.getState().authorized(call), session.getState().authorized(call)]);
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('signs out locally when the refresh is refused: this device was signed out elsewhere', async () => {
    const api = fakeApi({ refresh: jest.fn(expired) });
    const { session, store } = await signedIn(api);
    await expect(session.getState().authorized(expired)).rejects.toMatchObject({ status: 401, message: 'This device was signed out. Sign in again.' });
    expect(session.getState().status).toBe('signed-out');
    expect(store.forget).toHaveBeenCalled();
  });

  it('passes other errors straight through', async () => {
    const { session } = await signedIn(fakeApi());
    await expect(session.getState().authorized(() => Promise.reject(new ApiError(403, 'This account is locked')))).rejects.toMatchObject({ status: 403 });
    expect(session.getState().status).toBe('locked');
  });
});
