import { ApiError, type ApiClient, type Device, type KdfParams } from '@rahasya/api-client';
import { CRYPTO, LOCKOUT } from '@rahasya/config';
import { createAccountKeys, deriveKeys, fromBase64, open, ready, toBase64, unlockVault, wipe, WrongPasswordError } from '@rahasya/crypto';
import { createStore } from 'zustand/vanilla';
import type { DeviceStore, SavedAccount } from './device-store.types';
import { UnlockFailed } from './unlock-failed';

export { UnlockFailed };

/**
 * signed-out: no account on this device (welcome, sign up, sign in).
 * locked: an account is saved here; the master password unlocks it, offline.
 * unlocked: the vault key is in memory and the vault is open.
 */
export type SessionStatus = 'loading' | 'signed-out' | 'locked' | 'unlocked';

type SessionState = {
  status: SessionStatus;
  email?: string;
  /** Only ever in memory; locking wipes it. */
  vaultKey?: Uint8Array;
  load(): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  signIn(email: string, password: string, totpCode: string | undefined): Promise<void>;
  unlock(password: string): Promise<void>;
  lock(): void;
  signOut(): Promise<void>;
  /**
   * Runs an API call with the access token. An expired token is refreshed once and the call retried; if the
   * refresh is refused, this device was signed out elsewhere and the session signs out here too.
   */
  authorized<T>(call: (accessToken: string) => Promise<T>): Promise<T>;
};

type Deps = {
  api: ApiClient;
  device: DeviceStore;
  deviceInfo: Device;
  /** Argon2id settings for new accounts; tests pass cheaper ones. */
  kdfParams?: KdfParams;
  now?: () => number;
};

/** Lets the "working…" state paint before the slow key derivation blocks the thread. */
const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

export function createSession({ api, device, deviceInfo, kdfParams = { ...CRYPTO.argon2 }, now = Date.now }: Deps) {
  let saved: SavedAccount | null = null;
  // Wrong unlocks on this device. Kept in memory: the lockout slows a person at the keyboard; the cost of
  // Argon2id is what protects the saved wrapped key against offline guessing.
  let failedUnlocks = 0;
  let waitUntil = 0;
  // A refresh token works once, so calls that expire together share one refresh.
  let refreshing: Promise<string> | null = null;

  return createStore<SessionState>()((set, get) => {
    async function finishSignIn(email: string, account: Omit<SavedAccount, 'email' | 'deviceId'> & { deviceId: string }, vaultKey: Uint8Array) {
      saved = { email, ...account };
      await device.save(saved);
      failedUnlocks = 0;
      set({ status: 'unlocked', email, vaultKey });
    }

    function freshAccessToken(account: SavedAccount) {
      refreshing ??= api
        .refresh(account.refreshToken)
        .then(async ({ accessToken, refreshToken }) => {
          saved = { ...account, accessToken, refreshToken };
          await device.save(saved);
          return accessToken;
        })
        .finally(() => (refreshing = null));
      return refreshing;
    }

    return {
      status: 'loading',

      async load() {
        await ready();
        saved = await device.read();
        set(saved ? { status: 'locked', email: saved.email } : { status: 'signed-out', email: undefined });
      },

      async signUp(rawEmail, password) {
        const email = rawEmail.trim().toLowerCase();
        await nextFrame();
        const keys = createAccountKeys(password, kdfParams);
        const session = await api.register({
          email,
          authKey: toBase64(keys.authKey),
          kdfSalt: toBase64(keys.kdfSalt),
          kdfParams: keys.kdfParams,
          wrappedVaultKey: toBase64(keys.wrappedVaultKey),
          device: deviceInfo,
        });
        wipe(keys.authKey);
        const { accessToken, refreshToken, userId, deviceId } = session;
        await finishSignIn(email, { userId, deviceId, accessToken, refreshToken, kdfSalt: toBase64(keys.kdfSalt), kdfParams: keys.kdfParams, wrappedVaultKey: toBase64(keys.wrappedVaultKey) }, keys.vaultKey);
      },

      async signIn(rawEmail, password, totpCode) {
        const email = rawEmail.trim().toLowerCase();
        const { kdfSalt, kdfParams: params } = await api.prelogin(email);
        await nextFrame();
        const { authKey, wrapKey } = deriveKeys(password, fromBase64(kdfSalt), params);
        try {
          const session = await api.login({ email, authKey: toBase64(authKey), ...(totpCode && { totpCode }), device: { ...deviceInfo, id: saved?.deviceId } });
          const vaultKey = open(wrapKey, fromBase64(session.wrappedVaultKey));
          const { accessToken, refreshToken, userId, deviceId } = session;
          await finishSignIn(email, { userId, deviceId, accessToken, refreshToken, kdfSalt, kdfParams: params, wrappedVaultKey: session.wrappedVaultKey }, vaultKey);
        } finally {
          wipe(authKey, wrapKey);
        }
      },

      async unlock(password) {
        if (!saved) throw new Error('No account on this device');
        if (now() < waitUntil) throw new UnlockFailed(0, waitUntil - now());
        await nextFrame();
        try {
          const { authKey, vaultKey } = unlockVault(password, { kdfSalt: fromBase64(saved.kdfSalt), kdfParams: saved.kdfParams, wrappedVaultKey: fromBase64(saved.wrappedVaultKey) });
          wipe(authKey);
          failedUnlocks = 0;
          set({ status: 'unlocked', vaultKey });
        } catch (e) {
          if (!(e instanceof WrongPasswordError)) throw e;
          failedUnlocks++;
          const triesLeft = LOCKOUT.maxTries - failedUnlocks;
          if (triesLeft > 0) throw new UnlockFailed(triesLeft);
          failedUnlocks = 0;
          waitUntil = now() + LOCKOUT.waitMs;
          throw new UnlockFailed(0, LOCKOUT.waitMs);
        }
      },

      lock() {
        const { vaultKey } = get();
        if (vaultKey) wipe(vaultKey);
        set({ status: saved ? 'locked' : 'signed-out', vaultKey: undefined });
      },

      async signOut() {
        if (saved) await api.logout(saved.accessToken).catch(() => undefined); // signing out locally must work offline
        get().lock();
        await device.forget();
        saved = null;
        set({ status: 'signed-out', email: undefined });
      },

      async authorized(call) {
        if (!saved) throw new ApiError(401, 'Sign in first.');
        const account = saved;
        try {
          return await call(account.accessToken);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e;
        }
        let token: string;
        try {
          token = await freshAccessToken(account);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e;
          get().lock();
          await device.forget();
          saved = null;
          set({ status: 'signed-out', email: undefined });
          throw new ApiError(401, 'This device was signed out. Sign in again.');
        }
        return call(token);
      },
    };
  });
}
