import { base32, matchTotp, seal, totp, unseal } from './two-factor';

const rfcSecret = Buffer.from('12345678901234567890');

it.each([
  [59, '94287082'],
  [1111111109, '07081804'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
])('matches the RFC 6238 SHA-1 vector at t=%i', (t, code) => {
  expect(totp(rfcSecret, Math.floor(t / 30), 8)).toBe(code);
});

it('encodes base32 like RFC 4648', () => {
  expect(base32(rfcSecret)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  expect(base32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
});

it('accepts ±1 step and refuses replays', () => {
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30_000);
  expect(matchTotp(rfcSecret, totp(rfcSecret, step - 1), now, null)).toBe(step - 1);
  expect(matchTotp(rfcSecret, totp(rfcSecret, step + 2), now, null)).toBeNull();
  expect(matchTotp(rfcSecret, totp(rfcSecret, step), now, step)).toBeNull();
});

it('seals secrets so a changed byte fails', () => {
  const sealed = seal(rfcSecret);
  expect(unseal(sealed)).toEqual(rfcSecret);
  sealed[20] ^= 1;
  expect(() => unseal(sealed)).toThrow();
});
