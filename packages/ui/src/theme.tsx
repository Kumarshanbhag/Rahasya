import { type Theme, themes } from '@rahasya/tokens';
import { createContext, type ReactNode, useContext } from 'react';

const ThemeContext = createContext<Theme>(themes.daylight);

/** Provided once at the app root with the theme on screen; every shared component reads it. */
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/**
 * The current theme as values. Most styling is class names (bg-background, text-foreground) and needs no hook;
 * use this only for what class names can't express: gradients, SVG fills, native colour props.
 */
export const useTheme = () => useContext(ThemeContext);

/** Start and end points for a CSS-style gradient angle (135 = top-left to bottom-right). */
export function gradientPoints(angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } };
}

/** Gradient colour lists typed the way expo-linear-gradient wants them (at least two stops). */
export const stops = (colors: string[]) => colors as [string, string, ...string[]];
