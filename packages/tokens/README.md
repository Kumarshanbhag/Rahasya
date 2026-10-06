# @rahasya/tokens

Rahasya's look as data, one file per concern, and the source of the CSS every app imports.

```text
src/
  themes/
    glass-wallet.ts   Glass wallet (design code D9): dark, indigo light, glass wallet cards
    daylight.ts       Daylight (D10): light, pastel light, frosted glass; everyone's daytime theme
    holographic.ts    Holographic (D14): near-black with holographic edges
    console.ts        Admin console: fixed light theme for the admin app only
    types.ts          the Theme shape every theme fills in
    index.ts          all themes, and themeFor (Light / Dark / Auto → which theme)
  typography.ts       font family names and the font-size scale
  spacing.ts          spacing, corner radii, fixed sizes (touch target, form width)
  contrast.ts         WCAG contrast ratio, used by the tests
  css.ts              turns the themes into CSS variables for Tailwind / Uniwind
theme.css             generated; never edit by hand
```

Each theme has an `id` used in code (`'glass-wallet'`), a `name` shown to people ("Glass wallet") and the design's `code` (D9) for cross-checking against the mockups.

```bash
pnpm --filter @rahasya/tokens build   # regenerate theme.css after changing a token
pnpm --filter @rahasya/tokens test    # contrast in every theme, theme choice rules, CSS up to date
```

The tests hold every theme to at least 4.5:1 contrast for text and 3:1 for warning, danger and success colours.
