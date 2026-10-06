import * as SecureStore from 'expo-secure-store';
import type { DeviceStore, SavedAccount } from './device-store.types';

const KEY = 'rahasya.account';

/** Android: secure storage, encrypted by a key held in the Android Keystore. */
export const deviceStore: DeviceStore = {
  async read() {
    const saved = await SecureStore.getItemAsync(KEY);
    return saved ? (JSON.parse(saved) as SavedAccount) : null;
  },
  save: (account) => SecureStore.setItemAsync(KEY, JSON.stringify(account)),
  forget: () => SecureStore.deleteItemAsync(KEY),
};
