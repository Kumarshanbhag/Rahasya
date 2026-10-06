import type { KdfParams } from '@rahasya/api-client';

/**
 * What this device remembers between launches so the user only types their master password to unlock. The vault
 * key itself is never stored: only its wrapped form, which needs the master password to open.
 */
export type SavedAccount = {
  email: string;
  userId: string;
  deviceId: string;
  kdfSalt: string;
  kdfParams: KdfParams;
  wrappedVaultKey: string;
  accessToken: string;
  refreshToken: string;
};

export type DeviceStore = {
  read(): Promise<SavedAccount | null>;
  save(account: SavedAccount): Promise<void>;
  forget(): Promise<void>;
};
