import { fontFamily } from '../typography';
import type { Theme } from './types';

/** The admin console's fixed light theme, deliberately unlike any vault theme so the two are never confused. */
export const consoleTheme: Theme = {
  id: 'console',
  name: 'Admin console',
  code: 'Admin',
  dark: false,
  color: {
    background: '#F6F5FA',
    aurora: ['rgba(185,166,255,0.3)', 'rgba(255,179,138,0.3)'],
    foreground: '#1E1B2E',
    muted: '#6B6780',
    accent: '#6B4CFF',
    accentGradient: ['#8B6CFF', '#FF9A6B'],
    accentAngle: 135,
    onAccent: '#FFFFFF',
    soft: 'rgba(30,27,46,0.06)',
    selected: 'rgba(139,108,255,0.12)',
    warning: '#B45309',
    danger: '#BE185D',
    dangerSoft: 'rgba(190,24,93,0.10)',
    success: '#15803D',
    surface: ['rgba(255,255,255,0.84)', 'rgba(255,255,255,0.84)'],
    surfaceEdge: 'rgba(30,27,46,0.08)',
    orbGlow: 'rgba(139,108,255,0.35)',
    orbShine: 'rgba(255,255,255,0.9)',
  },
  font: { heading: fontFamily.soraSemiBold, body: fontFamily.sora, mono: fontFamily.mono },
};
