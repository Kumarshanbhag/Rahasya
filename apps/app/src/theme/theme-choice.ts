import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NightThemeId, ThemeMode } from '@rahasya/tokens';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ThemeChoice = {
  mode: ThemeMode;
  nightTheme: NightThemeId;
  setMode: (mode: ThemeMode) => void;
  setNightTheme: (nightTheme: NightThemeId) => void;
};

/**
 * The user's appearance choice. Saved on this device only and outside the vault, because it has to apply on the
 * lock screen before any key is available.
 */
export const useThemeChoice = create<ThemeChoice>()(
  persist(
    (set) => ({
      mode: 'auto',
      nightTheme: 'glass-wallet',
      setMode: (mode) => set({ mode }),
      setNightTheme: (nightTheme) => set({ nightTheme }),
    }),
    { name: 'rahasya-theme', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
