# Rahasya

Rahasya (रहस्य, "secret") is a zero-knowledge password manager. One Expo codebase ships the Android APK and the web app, a NestJS API stores only ciphertext, and a separate Next.js console lets admins manage accounts without ever reading a vault.

**Source of truth:** [`docs/SPEC.md`](docs/SPEC.md), exported from the Claude Doc "Rahasya implementation spec for Claude Code". It wins over the older PDFs in [`Documentation/`](Documentation) (PRD, design document, build plan). Mockups live in the [Rahasya screens](https://claude.ai/artifact/QgvBxcyArdcvGHwvrYktcG) canvas, animations in the [motion library](https://claude.ai/artifact/WjzKDR2Syfb3zcNvdzGJXd).

## Layout

| Path | Layer | What | Status |
| --- | --- | --- | --- |
| [`apps/api`](apps/api) | Backend | NestJS + Prisma: auth, vault sync, devices, admin, audit | Every screen done except server key escrow (see its README) |
| [`apps/api/prisma`](apps/api/prisma) | Database | Prisma schema and migrations, PostgreSQL 16 | Grows with each screen |
| [`apps/app`](apps/app) | Frontend | Expo app: Android and the vault web app | In progress: account screens, vault list, add entry, entry details |
| [`apps/admin`](apps/admin) | Frontend | Next.js admin console | Not started |
| [`packages/config`](packages/config) | Shared | Every fixed number from the spec | Done |
| [`packages/tokens`](packages/tokens) | Frontend | Themes, type and spacing; generates the CSS variables | Done |
| [`packages/crypto`](packages/crypto) | Client | All encryption, on the device (libsodium) | Done; Android vector check pending |
| [`packages/api-client`](packages/api-client) | Client | Typed API calls | Account and vault calls done |
| [`packages/ui`](packages/ui) | Frontend | Shared components | Eight done |
| [`packages/motion`](packages/motion) | Frontend | Animation building blocks | Not started |

**Bundlers:** Metro for the Expo app (Android and web; Expo dropped webpack) and Turbopack for the Next.js admin console. **Styling:** Tailwind class names through Uniwind, usable in any file without imports; see [`apps/app/README.md`](apps/app/README.md).

## Quick start

Needs Node 22+, pnpm 10 and Docker (or any Postgres 14+).

```bash
pnpm install
docker compose up -d                       # Postgres 16 on localhost:5433, with rahasya and rahasya_test
cp apps/api/.env.example apps/api/.env     # fill JWT_SECRET and DATA_KEY: openssl rand -base64 32
cp apps/app/.env.example apps/app/.env
pnpm --filter @rahasya/api db:deploy       # apply migrations
pnpm build                                 # shared packages and the API
pnpm --filter @rahasya/api dev             # API on http://localhost:3000
pnpm --filter @rahasya/app web             # web app on http://localhost:8081
pnpm test                                  # every package's tests
```

## Checking it works

### Locally

**Backend**

```bash
pnpm --filter @rahasya/api test                                   # 67 unit and e2e tests on rahasya_test
pnpm --filter @rahasya/api smoke                                  # 20 live checks against the running API
curl -s -X POST localhost:3000/auth/prelogin -H 'content-type: application/json' -d '{"email":"you@example.com"}'
```

The last line should print a salt and Argon2id settings: the API is up and can reach its database.

**Database**

```bash
cd apps/api && pnpm exec prisma studio          # browse every table at http://localhost:5555
psql rahasya -c "select email, status, totp_enabled, revision, created_at from users order by created_at desc limit 10;"
psql rahasya -c "select id, revision, deleted_at, length(blob) as bytes from vault_items order by updated_at desc limit 10;"
psql rahasya -c "select at, actor_label, action, result from audit_log order by id desc limit 10;"
```

What you should see: `vault_items.blob` is only random-looking bytes; `users.auth_hash` is an Argon2id hash, never the key; `revision` rises with each change; and any `UPDATE audit_log …` fails because the log is append-only. (With Docker, use `psql postgresql://rahasya:rahasya@localhost:5433/rahasya`.)

**Frontend**

```bash
pnpm --filter @rahasya/app test                                                 # component, screen, session and vault tests
pnpm --filter @rahasya/crypto test && pnpm --filter @rahasya/tokens test
E2E_API_URL=http://localhost:3000 pnpm --filter @rahasya/app test session.e2e   # account journey against the real API
```

Then in the browser at http://localhost:8081: create an account, save the recovery kit, lock, unlock with a wrong password (watch the tries count down), unlock, and sign out. In the browser's developer tools:

- **Network:** requests carry base64 keys and blobs only; your master password never appears in any request.
- **Application → IndexedDB → rahasya → device:** the saved account is encrypted, plus a `CryptoKey` marked non-extractable.

On Android, install a development build (see `apps/app/README.md`) and repeat the same journey.

### In production

Production runs the API on Render, Postgres on Neon and the web app on Vercel. Setting it up, releasing, rolling back, backups and restores are all in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Use a dedicated test account there, never a real person's.

**Backend**

```bash
curl -s -X POST https://<api-host>/auth/prelogin -H 'content-type: application/json' -d '{"email":"test-account@your-domain"}'
```

A salt and settings back means the API and its database are up. The free Render plan sleeps when idle, so the first call can take up to a minute. For a full run, point the smoke checks at **staging** (they create a throwaway account each time): `API=https://<staging-api-host> pnpm --filter @rahasya/api smoke`. Render's dashboard shows the API's logs; they never contain request bodies.

**Database**

Use Neon's SQL editor, or `psql "<neon connection string>"` with a **read-only** role (create one in Neon for this). Look an account up without touching it:

```sql
select id, email, status, totp_enabled, revision, last_login_at, created_at from users where email = 'test-account@your-domain';
select name, platform, last_seen_at, revoked_at from devices where user_id = '<id from above>';
select count(*) filter (where deleted_at is null and blob is not null) as entries, count(*) filter (where deleted_at is not null) as in_trash from vault_items where user_id = '<id>';
select at, actor_label, action, result from audit_log where target_id = '<id>' order by id desc limit 20;
```

Avoid Prisma Studio against production: it can edit rows. Back-ups and restores are covered in the build plan's release checklist.

**Frontend**

- **Web:** open the production URL, sign in with the test account, and repeat the Network and IndexedDB checks above.
- **Android:** install the release APK from GitHub Releases, sign in with the test account, lock and unlock.
- **Admin console** (once built): sign in with a security key from an allow-listed network, and check that the test account's actions appear in the audit log with "Log chain verified".

## Security model in one paragraph

The master password never leaves the device. The device derives a `masterKey` with Argon2id, splits it with HKDF into an `authKey` (sent at sign-in, stored only as an Argon2id hash) and a `wrapKey` (wraps the random `vaultKey`). Every entry, group name and label is encrypted with the `vaultKey` (XChaCha20-Poly1305) before it is sent. The API validates the ciphertext format and stores the blobs. It can't read them.
