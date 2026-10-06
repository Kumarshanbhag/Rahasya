# @rahasya/crypto

All of Rahasya's encryption, on the device: the only code that ever touches a master password, a key or a plaintext secret. It uses `react-native-libsodium`, which runs the native libsodium on Android and libsodium.js on the web, through one API.

```text
master password ──Argon2id──▶ master key ──HKDF──▶ auth key   (sent to the server, which stores only its hash)
                                           └─HKDF──▶ wrap key  (never leaves the device; encrypts the vault key)
vault key (random, made once at sign-up) ──XChaCha20-Poly1305──▶ every entry, group name and label
```

| Function | Used for |
| --- | --- |
| `createAccountKeys(password)` | Sign-up: salt, auth key, a new vault key and its wrapped form |
| `deriveKeys(password, salt, params)` | Sign-in: the auth key to send and the wrap key to open the vault key |
| `unlockVault(password, account)` | Unlock on this device, offline; throws `WrongPasswordError` |
| `seal` / `open`, `sealJson` / `openJson` | Encrypting and decrypting blobs (entries, names) |
| `sealForRecovery(vaultKey, orgPublicKey)` | Emergency-recovery opt-in |
| `toBase64` / `fromBase64` | The API's wire format (standard base64, padded) |
| `wipe(...keys)` | Overwriting keys once done |

Every blob is `0x01` version · `0x01` algorithm · 24-byte random nonce · ciphertext · 16-byte tag. The two header bytes are authenticated too, so changing any byte makes decryption fail.

**Tests** (`pnpm --filter @rahasya/crypto test`): Argon2id matches an independent implementation (@noble/hashes), HKDF matches RFC 5869, every single-byte change is refused, wrong keys are refused, nonces never repeat, and sizes match what the API checks. Still to do: run the same vectors on an Android device to prove byte-identical output there.
