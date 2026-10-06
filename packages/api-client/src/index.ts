/**
 * Typed calls to the Rahasya API. Everything sent is already encrypted or derived on the device: keys and blobs
 * travel as base64, never a master password or plaintext.
 */

export type KdfParams = { memoryKiB: number; iterations: number; parallelism: number };
export type Device = { id?: string; name: string; platform: 'android' | 'web' };

export type Session = {
  userId: string;
  deviceId: string;
  wrappedVaultKey: string;
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
};

export type RegisterBody = { email: string; authKey: string; kdfSalt: string; kdfParams: KdfParams; wrappedVaultKey: string; device: Device };
export type LoginBody = { email: string; authKey: string; totpCode?: string; device: Device };

/** An entry as the server keeps it: an encrypted blob plus the plaintext links it needs (group, labels). */
export type SyncItem = {
  id: string;
  groupId: string | null;
  labelIds: string[];
  /** null once the entry was deleted forever: drop it from the device too. */
  blob: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Set while the entry is in Trash. */
  deletedAt: string | null;
};
export type SyncGroup = { id: string; parentId: string | null; nameEnc: string; sortOrder: number; revision: number; createdAt: string; deletedAt: string | null };
export type SyncLabel = { id: string; nameEnc: string; revision: number; createdAt: string; deletedAt: string | null };
/** Everything changed since a revision. full = a complete snapshot that replaces what the device holds. */
export type SyncResult = { revision: number; full: boolean; items: SyncItem[]; groups: SyncGroup[]; labels: SyncLabel[] };

export type PutItemBody = { blob: string; groupId: string | null; labelIds: string[]; baseRevision?: number };
export type GroupInput = { id: string; parentId: string | null; nameEnc: string; sortOrder: number; deleted?: boolean };
export type LabelInput = { id: string; nameEnc: string; deleted?: boolean };

/** A failed call, with what the screen needs to explain it. status 0 means the server couldn't be reached. */
export class ApiError extends Error {
  readonly triesLeft?: number;
  readonly retryAfterMs?: number;
  readonly twoFactorRequired?: boolean;

  constructor(
    readonly status: number,
    message: string,
    details: { triesLeft?: number; retryAfterMs?: number; twoFactorRequired?: boolean } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, details);
  }
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createApiClient({ baseUrl, fetch = globalThis.fetch as unknown as Fetch }: { baseUrl: string; fetch?: Fetch }) {
  const root = baseUrl.replace(/\/$/, '');

  async function call<T>(method: string, path: string, { body, token }: { body?: unknown; token?: string } = {}): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    let res: Awaited<ReturnType<Fetch>>;
    try {
      res = await fetch(`${root}${path}`, { method, headers, ...(body !== undefined && { body: JSON.stringify(body) }) });
    } catch {
      throw new ApiError(0, "Can't reach Rahasya. Check your connection and try again.");
    }
    if (res.status === 204) return undefined as T;
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const message = Array.isArray(data.message) ? data.message.join('. ') : String(data.message ?? 'Something went wrong. Try again.');
      throw new ApiError(res.status, message, {
        triesLeft: data.triesLeft as number | undefined,
        retryAfterMs: data.retryAfterMs as number | undefined,
        twoFactorRequired: data.twoFactorRequired as boolean | undefined,
      });
    }
    return data as T;
  }

  return {
    /** The salt and key-derivation settings for an email, needed before keys can be derived to sign in. */
    prelogin: (email: string) => call<{ kdfSalt: string; kdfParams: KdfParams }>('POST', '/auth/prelogin', { body: { email } }),
    register: (body: RegisterBody) => call<Session>('POST', '/auth/register', { body }),
    login: (body: LoginBody) => call<Session>('POST', '/auth/login', { body }),
    /** Swaps a refresh token for new tokens. Each refresh token works once; never call this twice at the same time. */
    refresh: (refreshToken: string) => call<Pick<Session, 'accessToken' | 'refreshToken' | 'expiresIn'>>('POST', '/auth/refresh', { body: { refreshToken } }),
    logout: (token: string) => call<void>('POST', '/auth/logout', { token }),

    sync: (token: string, since: number) => call<SyncResult>('GET', `/vault/sync?since=${since}`, { token }),
    /** Creates or replaces an entry. conflict = another device changed it after baseRevision; its version is in history. */
    putItem: (token: string, id: string, body: PutItemBody) => call<{ id: string; revision: number; conflict: boolean }>('PUT', `/vault/items/${id}`, { body, token }),
    trashItem: (token: string, id: string) => call<{ id: string; revision: number; deletedAt: string }>('DELETE', `/vault/items/${id}`, { token }),
    restoreItem: (token: string, id: string) => call<{ id: string; revision: number }>('POST', `/vault/items/${id}/restore`, { token }),
    /** Deletes an entry that is already in Trash, for good. */
    purgeItem: (token: string, id: string) => call<{ id: string; revision: number }>('DELETE', `/vault/items/${id}?forever=true`, { token }),
    itemHistory: (token: string, id: string) => call<{ revision: number; blob: string; replacedAt: string }[]>('GET', `/vault/items/${id}/history`, { token }),
    putGroups: (token: string, groups: GroupInput[]) => call<{ revision: number }>('PUT', '/vault/groups', { body: { groups }, token }),
    putLabels: (token: string, labels: LabelInput[]) => call<{ revision: number }>('PUT', '/vault/labels', { body: { labels }, token }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
