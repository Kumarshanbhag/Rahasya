import { checkMasterPassword } from '../master-password';

it('rejects anything shorter than 12 characters, however clever', () => {
  expect(checkMasterPassword('Tr0ub4dor&3', 'priya@example.com')).toMatchObject({ ok: false, problem: 'Use at least 12 characters' });
});

it('rejects long but guessable passwords', () => {
  const result = checkMasterPassword('password1234', 'priya@example.com');
  expect(result.ok).toBe(false);
  expect(result.score).toBeLessThan(3);
  expect(result.problem).toBe('Too easy to guess. Add more unrelated words.');
});

it('treats the email address as guessable', () => {
  expect(checkMasterPassword('priyasharma2026', 'priyasharma2026@example.com').ok).toBe(false);
});

it('accepts a strong passphrase', () => {
  const result = checkMasterPassword('orbit candle mango thunder', 'priya@example.com');
  expect(result.ok).toBe(true);
  expect(result.problem).toBeUndefined();
  expect(result.score).toBeGreaterThanOrEqual(3);
});
