import { consoleTheme } from './console';
import { daylight } from './daylight';
import { glassWallet } from './glass-wallet';
import { holographic } from './holographic';
import type { NightThemeId, Theme, ThemeId, ThemeMode } from './types';

export type { NightThemeId, Theme, ThemeId, ThemeMode } from './types';

export const themes: Record<ThemeId, Theme> = {
  'glass-wallet': glassWallet,
  daylight,
  holographic,
  console: consoleTheme,
};

/** The themes a user can choose between in the vault app (the console theme is admin-only). */
export const vaultThemes = [daylight, glassWallet, holographic];

/** Light always shows Daylight; Dark shows the user's night theme; Auto follows the device's light or dark setting. */
export function themeFor(choice: { mode: ThemeMode; systemScheme: string | null | undefined; nightTheme: NightThemeId }): Theme {
  const night = choice.mode === 'dark' || (choice.mode === 'auto' && choice.systemScheme === 'dark');
  return themes[night ? choice.nightTheme : 'daylight'];
}
