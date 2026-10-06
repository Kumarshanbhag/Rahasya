import Svg, { Path } from 'react-native-svg';

/** Rahasya's keyhole mark, drawn in a 44 × 60 box. */
export const KEYHOLE_PATH = 'M22 4 A14 14 0 0 1 28 30.6 L33 56 L11 56 L16 30.6 A14 14 0 0 1 22 4 Z';

const paths = {
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  eyeOff: [
    'M3 3l18 18',
    'M10.6 10.6a2 2 0 0 0 2.8 2.8',
    'M9.9 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1',
    'M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6',
  ],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  copy: ['M9 9h12v12H9z', 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  check: ['M5 12l5 5 9-10'],
  plus: ['M12 5v14', 'M5 12h14'],
  back: ['M15 18l-6-6 6-6'],
  open: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  star: ['M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z'],
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M21 21l-4.3-4.3'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7L21 8', 'M21 3v5h-5'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
  fingerprint: ['M12 11v2a14 14 0 0 0 2.5 8', 'M8 11a4 4 0 0 1 8 0v1a10 10 0 0 0 2 6', 'M4.9 19a22 22 0 0 1-.9-7v-1a8 8 0 0 1 12-6.9'],
} as const;

export type IconName = keyof typeof paths;

/** Line icons on a 24 px grid; decorative, so the control around them carries the accessible name. */
export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" accessible={false}>
      {paths[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
