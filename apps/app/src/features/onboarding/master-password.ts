import { MASTER_PASSWORD } from '@rahasya/config';
import type { StrengthScore } from '@rahasya/ui';
import { strengthOf } from '@/lib/password-strength';

/**
 * Whether a new master password is good enough. It can never be reset, so it must be long and hard to guess;
 * the email address counts as a guess too.
 */
export function checkMasterPassword(password: string, email: string): { ok: boolean; score: StrengthScore; problem?: string } {
  const score = strengthOf(password, [email, ...email.split(/[@.]/)]);
  if (password.length < MASTER_PASSWORD.minLength) return { ok: false, score, problem: `Use at least ${MASTER_PASSWORD.minLength} characters` };
  if (score < MASTER_PASSWORD.minScore) return { ok: false, score, problem: 'Too easy to guess. Add more unrelated words.' };
  return { ok: true, score };
}
