import { type Theme, themeFor } from '@rahasya/tokens';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Uniwind } from 'uniwind';
import { useThemeChoice } from './theme-choice';

/**
 * The theme on screen now, as values. Most styling uses class names (bg-background, text-foreground) and needs
 * no hook; this is for what class names can't express, such as gradient colours.
 */
export function useChosenTheme(): Theme {
  const mode = useThemeChoice((s) => s.mode);
  const nightTheme = useThemeChoice((s) => s.nightTheme);
  return themeFor({ mode, systemScheme: useColorScheme(), nightTheme });
}

/** Mounted once at the app root: keeps every class-name style on the same theme as useChosenTheme. */
export function useApplyTheme() {
  const theme = useChosenTheme();
  useEffect(() => Uniwind.setTheme(theme.id), [theme.id]);
  return theme;
}
