# @rahasya/ui

The shared components screens are built from, styled with class names from `@rahasya/tokens`.

| Component | What it is |
| --- | --- |
| `ThemeProvider`, `useTheme` | The current theme as values; the app provides it once at its root. Use `useTheme` only for what class names can't express (gradients, SVG). |
| `Screen` | A full page: themed background, aurora lights, safe-area padding; `scroll` for forms, `narrow` to centre a form-width column on large screens. |
| `Button` | `primary` (the one main action, on the accent gradient), `secondary`, `link`; `loading` shows a spinner and blocks presses. |
| `TextField` | Labelled input; `secret` masks it with an eye button to show it; `error` and `hint` under it. |
| `StrengthMeter` | Password strength as four bars and a word. |
| `GlassOrb` | The brand mark: glass sphere with the keyhole. |
| `Icon`, `KEYHOLE_PATH` | Line icons and the keyhole outline. |

Still to come from the design: `SecretField`, `FieldRow`, `EntryRow`, `WalletCard`, `BentoTile`, `GroupTree`, `LabelChips`, `Toast`, `ClipboardPill`, `FloatingNavBar`, `SegmentedControl`, `ThemeSwatch`, and the admin components.

Tests live in `src/components/__tests__/` and run with the app's Jest (`pnpm --filter @rahasya/app test`). Write the test first: what the person sees, hears from a screen reader, and can do.
