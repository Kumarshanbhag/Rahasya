/** Spacing in px. Matches Tailwind's default scale (p-1 = 4, p-2 = 8 … p-12 = 48), so class names need no custom setup. */
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 12: 48 } as const;

/** Corner radius in px, by what is being drawn. */
export const radius = {
  chip: 12,
  row: 16,
  card: 22,
  input: 28,
  sheet: 28,
  drawer: 32,
} as const;

/** Fixed sizes in px. */
export const size = {
  /** Smallest tappable area, for accessibility. */
  touch: 44,
  orb: 150,
  field: 56,
  button: 56,
  /** Widest a form gets on large screens. */
  form: 420,
  /** Side margin on phones. */
  gutter: 20,
} as const;
