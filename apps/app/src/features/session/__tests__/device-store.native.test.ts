import * as SecureStore from 'expo-secure-store';
import { deviceStore } from '../device-store.native';
import type { SavedAccount } from '../device-store.types';

jest.mock('expo-secure-store', () => {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => values.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void values.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void values.delete(k)),
  };
});

const account: SavedAccount = {
  email: 'priya@example.com',
  userId: 'u1',
  deviceId: 'd1',
  kdfSalt: 'AAECAwQFBgcICQoLDA0ODw==',
  kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1 },
  wrappedVaultKey: 'AQE=',
  accessToken: 'jwt',
  refreshToken: 'r'.repeat(43),
};

it('keeps the account in Android secure storage between launches', async () => {
  expect(await deviceStore.read()).toBeNull();
  await deviceStore.save(account);
  expect(await deviceStore.read()).toEqual(account);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('rahasya.account', JSON.stringify(account));
});

it('forgets everything on sign-out', async () => {
  await deviceStore.save(account);
  await deviceStore.forget();
  expect(await deviceStore.read()).toBeNull();
});
