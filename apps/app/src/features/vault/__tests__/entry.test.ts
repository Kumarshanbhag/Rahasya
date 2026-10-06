import { PASSWORD_HISTORY_MAX } from '@rahasya/config';
import { blankEntry, type EntryData, forSaving, isHidden, mainSecret, recordHistory, subtitle, TEMPLATES } from '../entry';

const shape = (e: EntryData) => e.fields.map((f) => [f.label, f.kind]);

describe('templates', () => {
  it('a login asks for username, password and website', () => {
    expect(shape(blankEntry('login'))).toEqual([
      ['Username', 'text'],
      ['Password', 'secret'],
      ['Website', 'link'],
    ]);
  });

  it('a bank entry keeps the login password and the transaction PIN together', () => {
    expect(TEMPLATES.bank.nameLabel).toBe('Bank');
    expect(shape(blankEntry('bank'))).toEqual([
      ['Customer ID', 'text'],
      ['Account number', 'text'],
      ['Net-banking username', 'text'],
      ['Password', 'secret'],
      ['Transaction PIN', 'pin'],
    ]);
  });

  it('a card hides its number, CVV and PIN', () => {
    expect(shape(blankEntry('card'))).toEqual([
      ['Cardholder', 'text'],
      ['Card number', 'secret'],
      ['Expiry', 'text'],
      ['CVV', 'pin'],
      ['PIN', 'pin'],
    ]);
  });

  it('a Wi-Fi network and a secure note need little', () => {
    expect(TEMPLATES.wifi.nameLabel).toBe('Network');
    expect(shape(blankEntry('wifi'))).toEqual([
      ['Password', 'secret'],
      ['Security type', 'text'],
    ]);
    expect(TEMPLATES.note.nameLabel).toBe('Title');
    expect(blankEntry('note').fields).toEqual([]);
  });

  it('gives every field its own id', () => {
    const ids = blankEntry('bank').fields.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

it('treats secrets, PINs and one-time-code secrets as hidden', () => {
  expect((['secret', 'pin', 'totp'] as const).every((kind) => isHidden(kind))).toBe(true);
  expect((['text', 'link', 'email', 'note', 'date'] as const).some((kind) => isHidden(kind))).toBe(false);
});

it('finds what a list row shows: the username, and the password its copy button copies', () => {
  const entry = blankEntry('login');
  entry.fields[0]!.value = 'priya.s84';
  entry.fields[1]!.value = 'Qv7#mR2!tL9x';
  expect(subtitle(entry)).toBe('priya.s84');
  expect(mainSecret(entry)?.value).toBe('Qv7#mR2!tL9x');
  expect(mainSecret(blankEntry('note'))).toBeUndefined();
});

it('saves only what was filled in, with the name trimmed', () => {
  const entry = blankEntry('login');
  entry.name = '  Netflix ';
  entry.fields[0]!.value = 'priya@example.com';
  expect(forSaving(entry)).toMatchObject({ name: 'Netflix', fields: [expect.objectContaining({ label: 'Username', value: 'priya@example.com' })] });
});

describe('password history', () => {
  const at = (day: number) => new Date(Date.UTC(2026, 9, day));

  it('keeps the old value of a hidden field when it changes', () => {
    const before = blankEntry('login');
    before.fields[1]!.value = 'old password';
    const after = structuredClone(before);
    after.fields[1]!.value = 'new password';
    expect(recordHistory(before, after, at(6)).passwordHistory).toEqual([
      { fieldId: before.fields[1]!.id, label: 'Password', value: 'old password', changedAt: at(6).toISOString() },
    ]);
  });

  it('ignores visible fields and unchanged values', () => {
    const before = blankEntry('login');
    before.fields[0]!.value = 'old username';
    const after = structuredClone(before);
    after.fields[0]!.value = 'new username';
    expect(recordHistory(before, after, at(6)).passwordHistory).toEqual([]);
  });

  it(`keeps the last ${PASSWORD_HISTORY_MAX} values of each field, newest first`, () => {
    let entry = blankEntry('login');
    for (let i = 0; i <= PASSWORD_HISTORY_MAX + 2; i++) {
      const next = structuredClone(entry);
      next.fields[1]!.value = `password ${i}`;
      entry = recordHistory(entry, next, at(i + 1));
    }
    expect(entry.passwordHistory).toHaveLength(PASSWORD_HISTORY_MAX);
    expect(entry.passwordHistory[0]!.value).toBe(`password ${PASSWORD_HISTORY_MAX + 1}`);
  });
});
