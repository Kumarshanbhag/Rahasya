import { fontFamily } from '../typography';
import type { Theme } from './types';

/** Light: pale lilac with pastel lights and frosted white glass tiles. The daytime theme for everyone. */
export const daylight: Theme = {
  id: 'daylight',
  name: 'Daylight',
  code: 'D10',
  dark: false,
  color: {
    background: '#F5F3FA',
    aurora: ['#B9A6FF', '#FFB38A', '#8EE3C8'],
    foreground: '#1E1B2E',
    muted: '#6B6780',
    accent: '#6B4CFF',
    accentGradient: ['#8B6CFF', '#FF9A6B'],
    accentAngle: 135,
    onAccent: '#FFFFFF',
    soft: 'rgba(255,255,255,0.85)',
    selected: 'rgba(139,108,255,0.14)',
    warning: '#B45309',
    danger: '#BE185D',
    dangerSoft: 'rgba(190,24,93,0.10)',
    success: '#15803D',
    surface: ['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.55)'],
    surfaceEdge: 'rgba(255,255,255,0.85)',
    orbGlow: 'rgba(139,108,255,0.35)',
    orbShine: 'rgba(255,255,255,0.9)',
  },
  font: { heading: fontFamily.soraSemiBold, body: fontFamily.sora, mono: fontFamily.mono },
};
