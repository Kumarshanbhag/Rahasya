# @rahasya/api: backend and database

NestJS + Prisma 7 on PostgreSQL. The API syncs ciphertext and manages accounts; no endpoint accepts or returns a plaintext secret. Spec: `docs/SPEC.md` → "API and database".

## Status by screen

| Screen | Endpoints | Tables | Status |
| --- | --- | --- | --- |
| Welcome, sign up, sign in | `POST /auth/prelogin`, `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | `users`, `devices`, `refresh_tokens` | Done |
| Two-step sign-in (sign up, S8) | `POST /auth/2fa/setup`, `/auth/2fa/verify` | `users` | Done |
| S1 Unlock, Splash | none: unlock unwraps the cached vault key on the device | none | Nothing to build |
| S2 Home, S3 Group drawer | `GET /vault/sync?since=`, `GET/PUT /vault/groups`, `GET/PUT /vault/labels` | `vault_items`, `groups`, `labels`, `item_labels` | Done |
| S4 Entry detail | `GET /vault/sync`, `GET /vault/items/:id/history` | `item_history` | Done |
| S5 Add, S9 Edit, S10 Add field, S11 Save | `PUT /vault/items/:id` | `vault_items`, `item_history`, `item_labels` | Done |
| Trash | `DELETE /vault/items/:id` (`?forever=true`), `POST /vault/items/:id/restore`, hourly purge | `vault_items` | Done |
| S6 Generator, S7 Security health | none: computed on the device | none | Nothing to build |
| S8 Settings | `GET /devices`, `DELETE /devices/:id`, `POST /account/rotate-key`, two-step, logout | `devices`, `users` | Done |
| A1 Sign in | `POST /admin/auth/signin`, `/signin/verify`, `/invite/options`, `/invite/accept`, `/step-up`, `GET /admin/auth/me` | `admins`, `admin_keys` | Done |
| A2 Users | `GET /admin/users`, `POST /admin/users/:id/lock`, `/suspend`, `/activate`, `/reset-2fa`, `POST /admin/invites` | `users`, `user_invites` | Done |
| A3 Audit log | `GET /admin/audit`, `/admin/audit/verify`, `/admin/audit/export` | `audit_log` | Done |
| A4 Recovery (Option B) | `GET/POST /admin/recovery`, `GET /admin/recovery/:id`, `POST .../confirm`, `.../cancel`, `GET .../package`, `POST .../complete`; user side: `GET /recovery/public-key`, `PUT/DELETE /account/recovery`, `GET /recovery`, `POST /recovery/:id/cancel` | `recovery_keys`, `recovery_requests` | Done |
| A5 Admins and roles | `GET/POST /admin/admins`, `PATCH/DELETE /admin/admins/:id`, `GET/POST /admin/roles`, `PATCH /admin/roles/:id`, `POST /admin/super/handover` | `admins`, `admin_roles` | Done |
| Urgent decrypt (Option C, escrow) | not built | `recovery_keys` (kind `ESCROW`) | Waiting on a decision (see below) |
| `/policies`, `/settings` | not in the API table | none | Waiting on the spec |
| Analytics (Mixpanel) | `POST /events` relay with the allowlist | none | Planned (spec "Analytics"); built with the frontend |

## Rules the API enforces

- **Ciphertext only.** Every blob must have the spec's header (`0x01` version, `0x01` XChaCha20-Poly1305) and a sane size, or it's a 400. Keys and salts must be exactly 32 and 16 bytes.
- **Sign-in lockout:** 5 tries per account, then 30 s. Tries are claimed atomically before the key is checked, so parallel guesses can't exceed it. Auth endpoints are also rate-limited per IP.
- **Sessions:** 15-minute JWT (audience `vault`) plus a 30-day refresh token that rotates on every use. A reused token signs the device out. Every request re-checks the device and account, so "sign out a device" and admin locks act at once.
- **Sync:** each user has a revision counter. Every write takes that row's lock first, bumps it and stamps the rows it touches; `since=` returns everything newer. The newest write wins and the version it replaced goes to history (last 10, 30 days), so a conflict never loses data.
- **Groups:** at most 3 levels. Each write validates the whole tree (owner, depth, cycles), and deleting a group with live subgroups is refused.
- **Trash:** 30 days, then purged by an hourly job. "Delete forever" leaves a tombstone (`blob: null`) so other devices drop the entry too.
- **Admin console:** only `ADMIN_IP_ALLOWLIST` addresses reach `/admin`. Sign-in takes a password and then a security key (WebAuthn). Sessions last 15 minutes (audience `admin`, never valid on vault routes). Permissions come from the role; the super admin is a protected flag that the database limits to one, and every change to it is refused (403) and logged, except a handover confirmed with the super admin's own key.
- **Audit log:** append-only (a trigger refuses UPDATE, DELETE and TRUNCATE) and hash-chained (each entry's SHA-256 covers the previous one). `GET /admin/audit/verify` recomputes the chain. Admin actions are written in the same transaction as the change; an action with outside effects is logged before it runs.
- **Recovery (Option B):** the user opts in by uploading the vault key sealed to the organisation's offline public key. An admin requests with a reason and confirms with a fresh security-key touch, which starts the wait (48 h default). The user can cancel throughout. After the wait the console gets the sealed key, opens it on the admin's computer, and sends only the new master password's derived values. The server never sees the vault key.

## Server commands

```bash
pnpm --filter @rahasya/api build
pnpm --filter @rahasya/api admin setup-super-admin you@example.com "Your Name"   # prints the invite link
pnpm --filter @rahasya/api admin break-glass you@example.com reset-keys|freeze|unfreeze
```

## Open questions (each marked `TODO:` in the code)

- **Endpoints a screen needs but the spec's API table lacks:** "Delete forever", entry history, change master password, admin sign-in and invites, user activate (PRD FR-26), admin cancel of a recovery, the recovery package and completion, and the user's recovery opt-in and request list. I named them after the PRD, the design document and the mockups.
- **Email and push notifications** (users told about admin actions and recovery; Owners told about admin changes): no provider is chosen. Admin invite links are returned to the console instead of emailed.
- **Option C escrow and urgent decrypt:** needs a cloud KMS (a monthly cost) and server-side decryption; it's off by default, so it's not built.
- **Policies and settings:** the recovery wait is the `RECOVERY_WAIT_HOURS` env var until the `/policies` screen has endpoints.
- **Break-glass "with the offline key":** for now, shell access to the API host is the only gate.
- **Names:** the A2 mockup shows user names, but `users` stores none (only the admin's own name is stored). Device locations ("Chrome, Pune") would need a GeoIP database.
- **Turning two-step sign-in off** has no endpoint; an admin reset is the only way today.

## Commands

```bash
pnpm dev                      # watch mode on PORT (3000)
pnpm test                     # unit + e2e against TEST_DATABASE_URL
pnpm smoke                    # 20 live checks against a running API (API=http://... to point elsewhere)
pnpm db:migrate --name <x>    # new migration from schema.prisma (dev database)
pnpm db:deploy                # apply migrations (CI, production)
```

The tests run on a real Postgres and use fresh random accounts, so they never need a wiped database. A software security key (`test/soft-key.ts`) drives the real WebAuthn checks.
