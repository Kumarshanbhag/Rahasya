# @rahasya/api-client

Typed calls to the Rahasya API, shared by the vault app and (later) the admin console. Built so far: `prelogin`, `register`, `login`, `refresh`, `logout`, and the vault calls `sync`, `putItem`, `trashItem`, `restoreItem`, `purgeItem`, `itemHistory`, `putGroups`, `putLabels`. Devices and settings calls come with their screens.

Failures throw `ApiError` with what a screen needs to explain them: `status` (0 when the server can't be reached), a readable `message`, and `triesLeft`, `retryAfterMs`, `twoFactorRequired` from sign-in. `fetch` can be injected, which the tests use.

**Contract the backend already implements (see `apps/api/README.md`):**

- **Sync:** `GET /vault/sync?since=<revision>` returns every item, group and label changed after that revision, plus the new `revision`. Store it and send it next time. `full: true` means a complete snapshot: replace the cache.
- **Tombstones:** an item with `blob: null` was deleted forever. A group or label with `deletedAt` set is gone.
- **Writes:** `PUT /vault/items/:id` with a client-generated UUID and `baseRevision`. The newest write always wins; `conflict: true` means another device changed it first. The replaced version is in `GET /vault/items/:id/history`, so show "Review both versions".
- **Refresh tokens rotate on every use.** Serialise refreshes per device: if the same token is used twice, the API treats it as stolen and signs the device out.
- **Analytics (planned):** `track(event, props)` will add the shared properties (`device_id`, `session_id`, `app_version`, `theme`…), queue offline and send batches to `POST /events`, never to Mixpanel directly. Only event and property names listed in `@rahasya/config` are allowed; never vault content, search text or an email.

```bash
pnpm --filter @rahasya/api-client test
```
