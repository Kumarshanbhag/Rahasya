import { useStore } from 'zustand';
import { session } from '@/features/session';
import { api } from '@/lib/api';
import { createVault } from './vault-store';

export type { Entry } from './vault-store';

/** The one vault for the running app. */
export const vault = createVault({ api, session });

// Decrypted entries live only while the vault is open.
session.subscribe((s) => {
  if (s.status !== 'unlocked') vault.getState().clear();
});

export function useVault<T>(select: (state: ReturnType<typeof vault.getState>) => T) {
  return useStore(vault, select);
}
