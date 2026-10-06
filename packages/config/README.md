# @rahasya/config

Every fixed number from `docs/SPEC.md` ("Product rules and fixed numbers" and "Encryption") in one module, so the screens and the API read the same values: reveal and clipboard timers, auto-lock, lockout, history depth and retention, Trash retention, group depth, recovery wait, admin session, motion rules, Argon2id defaults and the ciphertext layout.

```ts
import { LOCKOUT, TRASH_RETENTION_MS, CRYPTO } from '@rahasya/config';
```

Change a rule here, never in screen or API code. `pnpm --filter @rahasya/config build` emits `dist/` (CommonJS and types), which the other workspaces import.
