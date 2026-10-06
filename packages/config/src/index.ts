/**
 * Every fixed number from docs/SPEC.md ("Product rules and fixed numbers" and "Encryption") lives here,
 * so the screens and the API read the same values.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const DAY = 24 * 60 * MINUTE;

/** A revealed secret hides itself again after this long. */
export const REVEAL_MS = 20 * SECOND;
/** The clipboard is cleared this long after a copy. */
export const CLIPBOARD_CLEAR_MS = 30 * SECOND;
/** Auto-lock when idle, a user setting in minutes. */
export const AUTO_LOCK_MIN = { default: 5, min: 1, max: 60 } as const;
/** Wrong master password lockout (unlock on the device, sign-in on the API). */
export const LOCKOUT = { maxTries: 5, waitMs: 30 * SECOND } as const;
/** Unlock budget after Argon2id on a mid-range phone. */
export const UNLOCK_BUDGET_MS = 1.5 * SECOND;
/** Changes reach the other devices within this long when online. */
export const SYNC_DELAY_MS = 5 * SECOND;
/** Previous versions kept per entry. */
export const PASSWORD_HISTORY_MAX = 10;
/** Removed fields and edit history are kept this long. */
export const HISTORY_RETENTION_MS = 30 * DAY;
/** The Undo toast after a delete, and how long Trash keeps entries. */
export const UNDO_DELETE_MS = 5 * SECOND;
export const TRASH_RETENTION_MS = 30 * DAY;
/** Groups nest at most this deep. */
export const GROUP_MAX_DEPTH = 3;
/** Emergency recovery waiting period, an organisation setting in hours. */
export const RECOVERY_WAIT_H = { default: 48, min: 0, max: 7 * 24 } as const;
/** Admin console session length. */
export const ADMIN_SESSION_MS = 15 * MINUTE;
/** How long an admin invite link works. */
export const ADMIN_INVITE_TTL_MS = 7 * DAY;
/** Security health score range. */
export const HEALTH_SCORE = { min: 0, max: 100 } as const;
/** Animation rules: skippable when longer than skippableOverMs, a quicker version after quickAfterPlays, and timing within toleranceMs of the reference animations. */
export const MOTION = {
  skippableOverMs: 1 * SECOND,
  quickAfterPlays: 3,
  quickFactor: 0.6,
  reducedFadeMs: 200,
  fps: 60,
  toleranceMs: 50,
} as const;
/** Accessibility floors: text contrast ratio and minimum touch target. */
export const CONTRAST_MIN = 4.5;
export const TOUCH_TARGET_PX = 44;

/** Sign-up: master password floor (strength score 0 to 4). */
export const MASTER_PASSWORD = { minLength: 12, minScore: 3 } as const;
/** Password generator length range. */
export const GENERATOR = { minLength: 8, maxLength: 64, defaultLength: 18 } as const;
/** Two-step sign-in and stored one-time codes. */
export const TOTP = { digits: 6, periodSec: 30 } as const;
/** Sessions: a short-lived access token plus a rotating refresh token. */
export const SESSION = { accessTtlSec: 15 * 60, refreshTtlMs: 30 * DAY } as const;

/** Encryption: key derivation and the format every ciphertext blob uses. */
export const CRYPTO = {
  saltBytes: 16,
  keyBytes: 32,
  nonceBytes: 24,
  tagBytes: 16,
  version: 0x01,
  algXChaCha20Poly1305: 0x01,
  /** Starting Argon2id settings; tuned per device class and stored per user. */
  argon2: { memoryKiB: 64 * 1024, iterations: 3, parallelism: 1 },
  /** Never tune memory below 32 MB, or low-end phones get weak protection. */
  argon2Min: { memoryKiB: 32 * 1024, iterations: 1 },
  argon2Max: { memoryKiB: 1024 * 1024, iterations: 20 },
  hkdfInfo: { auth: 'rahasya-auth', wrap: 'rahasya-wrap' },
} as const;
/** Version byte, algorithm byte, nonce and tag around every ciphertext. */
export const BLOB_OVERHEAD = 2 + CRYPTO.nonceBytes + CRYPTO.tagBytes;
/** XChaCha20-Poly1305(wrapKey, vaultKey). */
export const WRAPPED_KEY_BYTES = BLOB_OVERHEAD + CRYPTO.keyBytes;
/** X25519 sealed box of the vaultKey: ephemeral public key (32) · MAC (16) · key (32). */
export const SEALED_KEY_BYTES = 32 + 16 + CRYPTO.keyBytes;

/** Admin console permissions; custom roles pick from these. */
export const ADMIN_PERMISSIONS = [
  'users.view',
  'users.manage', // invite, lock, suspend, reset two-step
  'recovery', // start and confirm recovery
  'decrypt', // urgent decrypt, only for organisations that run server key escrow
  'audit.view',
  'admins.manage', // admins and roles
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** Built-in roles. The super admin is a protected flag on one admin, not a role, and holds every permission. */
export const BUILT_IN_ROLES: Record<'Owner' | 'Admin' | 'Auditor', readonly AdminPermission[]> = {
  Owner: ADMIN_PERMISSIONS,
  Admin: ['users.view', 'users.manage', 'recovery', 'audit.view'],
  Auditor: ['users.view', 'audit.view'],
};

/** API safety limits that keep any one request bounded. */
export const LIMITS = {
  itemBlobMaxBytes: 128 * 1024,
  nameBlobMaxBytes: 1024,
  labelsPerItem: 50,
  batchMax: 500,
} as const;
