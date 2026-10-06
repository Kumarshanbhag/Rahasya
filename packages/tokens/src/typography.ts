/** Font family names as the app registers them (files in apps/app/assets/fonts). */
export const fontFamily = {
  outfit: 'Outfit-Regular',
  outfitSemiBold: 'Outfit-SemiBold',
  sora: 'Sora-Regular',
  soraSemiBold: 'Sora-SemiBold',
  /** Monospace for revealed secrets, codes and timers, so 0/O and l/1 never look alike. */
  mono: 'DMMono-Medium',
} as const;

/** Font sizes in px, smallest to largest. */
export const fontSize = {
  caption: 11,
  meta: 12,
  label: 13,
  body: 15,
  button: 16,
  title: 22,
  page: 30,
  display: 34,
} as const;
