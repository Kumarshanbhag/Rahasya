import { fontFamily } from '../typography';
import type { Theme } from './types';

/** Dark: deep indigo with drifting violet, teal and pink light; the home screen stacks entries as glass wallet cards. */
export const glassWallet: Theme = {
  id: 'glass-wallet',
  name: 'Glass wallet',
  code: 'D9',
  dark: true,
  color: {
    background: '#0B0A1A',
    aurora: ['#6B4CFF', '#14B8A6', '#F472B6'],
    foreground: '#F4F2FF',
    muted: '#C9C4E8',
    accent: '#C4B5FD',
    accentGradient: ['#6B4CFF', '#F472B6'],
    accentAngle: 135,
    onAccent: '#FFFFFF',
    soft: 'rgba(255,255,255,0.14)',
    selected: 'rgba(255,255,255,0.16)',
    warning: '#FBBF24',
    danger: '#F9A8D4',
    dangerSoft: 'rgba(249,168,212,0.16)',
    success: '#6EE7B7',
    surface: ['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.06)'],
    surfaceEdge: 'rgba(255,255,255,0.22)',
    orbGlow: 'rgba(107,76,255,0.45)',
    orbShine: 'rgba(255,255,255,0.5)',
  },
  font: { heading: fontFamily.outfitSemiBold, body: fontFamily.outfit, mono: fontFamily.mono },
};
