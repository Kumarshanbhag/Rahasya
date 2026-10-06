# apps/app: the vault app (Android and web)

Expo SDK 57 with Expo Router: one codebase builds the Android app and the web app. Everything secret is encrypted on the device by `@rahasya/crypto` before it reaches the API.

**Built so far:** welcome, create account (with live master-password strength), recovery kit, sign in (with two-step code), unlock (with the 5-tries / 30-second wait), the vault list (search, sort, copy from the row, pull to sync), adding an entry (five templates, password generator) and viewing one (hidden fields masked with show, copy and 20-second auto-hide; earlier passwords; favourite; Trash). Expired access tokens refresh themselves. Account and vault journeys run end to end against the real API, including an entry saved on one device and opened on another.

## Folder layout

```text
apps/app/
  assets/
    brand/        source artwork (app-icon.svg) the icons are drawn from
    fonts/        bundled font files (never fetched) and their licences
    images/       app icon, Android adaptive icon layers, splash mark, favicon
  src/
    app/          routes only: each file is a URL (welcome.tsx → /welcome) and just renders a screen
    features/     the screens and the logic behind them, grouped by journey
      onboarding/   welcome, create account, recovery kit, master-password strength
      session/      sign in, unlock, the session (sign up/in, lock, unlock, sign out), device storage
      vault/        the vault list, add entry, entry details, the entry model, the decrypted vault store, search and sort
      <feature>/__tests__/   tests sit next to what they test
    lib/          app-wide services: the API client, clipboard (clears after 30 s), password strength, this device's name
    theme/        the user's theme choice and applying it
    global.css    imports Tailwind, Uniwind and the generated theme variables
  jest.setup.ts   test-wide mocks
```

Shared code lives in `packages/`: `tokens` (colours, type, spacing), `ui` (components), `crypto`, `api-client`, `config` (fixed numbers). Animations will live in `packages/motion` (see its README).

## Bundler: Metro, not webpack

Expo bundles with **Metro** for Android and web alike; Expo dropped webpack support, so Metro is the only maintained path and it is what `expo start` and `expo export` use. The admin console (Next.js 16) uses **Turbopack**, Next's default. Both are faster than webpack and need no bundler config here beyond `metro.config.js`.

## Styling: class names, no imports

Styles are Tailwind class names, compiled to native styles by [Uniwind](https://docs.uniwind.dev): any file can write `className="bg-background text-foreground rounded-card p-4"` without importing anything. The class names come from `packages/tokens`:

| Class | From |
| --- | --- |
| `bg-background`, `text-foreground`, `text-muted`, `text-accent`, `border-surface-edge`, `bg-danger` … | theme colours (`--color-*`) |
| `font-heading`, `font-body`, `font-mono` | theme fonts (each theme has its own) |
| `text-caption` … `text-display` | font sizes |
| `rounded-chip`, `rounded-card`, `rounded-input`, `rounded-sheet` | corner radii |
| `p-4`, `gap-3`, `px-5` | Tailwind's spacing scale (4 px steps), unchanged |

The four themes (Glass wallet, Daylight, Holographic, and the admin console's) are CSS variants; `useApplyTheme` switches all of them at once when the user changes theme. For the few values class names can't carry (gradient stops, SVG fills) components call `useTheme()` from `@rahasya/ui`. Edit colours in `packages/tokens/src/themes/*.ts`, then run `pnpm --filter @rahasya/tokens build` to regenerate `theme.css` (a test fails if you forget).

## Test-first workflow

Every screen and rule starts as a failing test, then gets just enough code to pass.

1. Write the test in the feature's `__tests__/`, describing what the user sees and does (`getByRole('button', { name: 'Unlock' })`, `getByLabelText('Master password')`), not implementation details.
2. Run it and watch it fail: `pnpm test path/to/the.test.tsx`.
3. Write the code until it passes, then tidy it with the test still green.

Tests use React Native Testing Library 14, whose `render`, `fireEvent` and `act` are async (`await render(...)`). They run with the Android preset; web-only code (like `device-store.web.ts`) has its own node-environment tests. `@rahasya/crypto` runs for real in tests, with cheap Argon2id settings.

```bash
pnpm test                                                        # all app tests (the live journeys run when E2E_API_URL is set)
pnpm test src/features/session                                   # one folder
E2E_API_URL=http://localhost:3000 pnpm test session.e2e          # the account journey against a running API
pnpm typecheck
```

## Running it

```bash
cp .env.example .env            # EXPO_PUBLIC_API_URL: the API this build talks to
pnpm web                        # web at http://localhost:8081 (the API must allow this origin: CORS_ORIGINS)
pnpm build:web                  # static web build in dist/
```

**Android needs a development build, not Expo Go:** the app uses native modules (libsodium, secure storage). Build one with `npx expo run:android` (Android SDK installed) or `npx eas-cli@latest build --profile development`, then `pnpm android`.
