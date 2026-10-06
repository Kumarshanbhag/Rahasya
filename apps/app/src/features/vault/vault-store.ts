import type { ApiClient, SyncItem } from '@rahasya/api-client';
import { fromBase64, openJson, randomId, sealJson, toBase64 } from '@rahasya/crypto';
import { createStore } from 'zustand/vanilla';
import { type EntryData, forSaving, recordHistory } from './entry';

export type Entry = {
  id: string;
  data: EntryData;
  groupId: string | null;
  labelIds: string[];
  /** The server's revision of this entry; sent back when saving an edit to detect clashes. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Set while the entry is in Trash. */
  deletedAt: string | null;
};

type VaultState = {
  entries: Record<string, Entry>;
  /** The server revision the last sync reached; the next sync asks only for what changed after it. */
  revision: number;
  /** Entries the last sync couldn't decrypt (damaged, or written with another key). */
  unreadable: number;
  sync(): Promise<void>;
  /** Encrypts and saves a new or edited entry. conflict = another device changed it first; its version is in history. */
  save(input: { id?: string; data: EntryData; groupId?: string | null; labelIds?: string[] }): Promise<{ id: string; conflict: boolean }>;
  trash(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  purge(id: string): Promise<void>;
  /** Forgets every decrypted entry; called when the vault locks. */
  clear(): void;
};

type SessionAccess = {
  getState(): { vaultKey?: Uint8Array; authorized<T>(call: (token: string) => Promise<T>): Promise<T> };
};

/** The open vault: entries decrypted in memory while unlocked, encrypted before anything is sent. */
export function createVault({ api, session }: { api: ApiClient; session: SessionAccess }) {
  const key = () => {
    const { vaultKey } = session.getState();
    if (!vaultKey) throw new Error('The vault is locked');
    return vaultKey;
  };
  const authorized = <T>(call: (token: string) => Promise<T>) => session.getState().authorized(call);

  return createStore<VaultState>()((set, get) => {
    const update = (id: string, change: Partial<Entry>) => {
      const entry = get().entries[id];
      if (entry) set({ entries: { ...get().entries, [id]: { ...entry, ...change } } });
    };

    return {
      entries: {},
      revision: 0,
      unreadable: 0,

      async sync() {
        const result = await authorized((token) => api.sync(token, get().revision));
        const vaultKey = key();
        const entries = result.full ? {} : { ...get().entries };
        let unreadable = 0;
        for (const item of result.items) {
          if (!item.blob) {
            delete entries[item.id];
            continue;
          }
          try {
            entries[item.id] = toEntry(item, openJson<EntryData>(vaultKey, fromBase64(item.blob)));
          } catch {
            unreadable++;
          }
        }
        set({ entries, revision: result.revision, unreadable });
      },

      async save({ id = randomId(), data, groupId = null, labelIds = [] }) {
        const existing = get().entries[id];
        const toSave = existing ? recordHistory(existing.data, forSaving(data), new Date()) : forSaving(data);
        const blob = toBase64(sealJson(key(), toSave));
        const result = await authorized((token) => api.putItem(token, id, { blob, groupId, labelIds, ...(existing && { baseRevision: existing.revision }) }));
        const now = new Date().toISOString();
        set({
          entries: {
            ...get().entries,
            [id]: { id, data: toSave, groupId, labelIds, revision: result.revision, createdAt: existing?.createdAt ?? now, updatedAt: now, deletedAt: existing?.deletedAt ?? null },
          },
        });
        return { id, conflict: result.conflict };
      },

      async trash(id) {
        const { revision, deletedAt } = await authorized((token) => api.trashItem(token, id));
        update(id, { revision, deletedAt });
      },

      async restore(id) {
        const { revision } = await authorized((token) => api.restoreItem(token, id));
        update(id, { revision, deletedAt: null });
      },

      async purge(id) {
        await authorized((token) => api.purgeItem(token, id));
        const { [id]: _gone, ...rest } = get().entries;
        set({ entries: rest });
      },

      clear: () => set({ entries: {}, revision: 0, unreadable: 0 }),
    };
  });
}

function toEntry(item: SyncItem, data: EntryData): Entry {
  return {
    id: item.id,
    data,
    groupId: item.groupId,
    labelIds: item.labelIds,
    revision: item.revision,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    deletedAt: item.deletedAt,
  };
}
