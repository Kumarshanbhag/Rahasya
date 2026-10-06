import { fontFamily } from '../typography';
import type { Theme } from './types';

/** Dark: near-black with a faint violet glow; tiles have shifting holographic edges and headings a holographic fill. */
export const holographic: Theme = {
  id: 'holographic',
  name: 'Holographic',
  code: 'D14',
  dark: true,
  color: {
    background: '#07070A',
    aurora: ['rgba(179,136,255,0.16)'],
    foreground: '#F4F4F6',
    muted: '#9A9AA6',
    accent: '#7CF7FF',
    accentGradient: ['#7CF7FF', '#B388FF', '#FF8AD8', '#FFE08A'],
    accentAngle: 120,
    onAccent: '#07070A',
    soft: '#1E1E26',
    selected: '#1E1E26',
    warning: '#FFE08A',
    danger: '#FF8AD8',
    dangerSoft: 'rgba(255,138,216,0.14)',
    success: '#7CF7FF',
    surface: ['#121217', '#121217'],
    surfaceEdge: '#B388FF',
    orbGlow: 'rgba(179,136,255,0.35)',
    orbShine: 'rgba(255,255,255,0.2)',
  },
  font: { heading: fontFamily.outfitSemiBold, body: fontFamily.outfit, mono: fontFamily.mono },
};
