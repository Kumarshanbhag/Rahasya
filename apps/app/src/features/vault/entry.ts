import { PASSWORD_HISTORY_MAX } from '@rahasya/config';

/** What a field holds. Hidden kinds are masked until revealed and can be copied without being shown. */
export type FieldKind = 'text' | 'secret' | 'pin' | 'link' | 'email' | 'totp' | 'note' | 'date';
export type Field = { id: string; label: string; kind: FieldKind; value: string };
export type Template = 'login' | 'bank' | 'card' | 'wifi' | 'note';
export type PastValue = { fieldId: string; label: string; value: string; changedAt: string };

/** One vault entry as the user sees it. It only ever leaves the device encrypted, as a whole. */
export type EntryData = {
  template: Template;
  name: string;
  fields: Field[];
  notes: string;
  favourite: boolean;
  /** Earlier values of hidden fields, newest first, so an old password can be found after a change. */
  passwordHistory: PastValue[];
};

const HIDDEN: FieldKind[] = ['secret', 'pin', 'totp'];
export const isHidden = (kind: FieldKind) => HIDDEN.includes(kind);

/** The starting fields for each kind of entry; people can add more and remove the optional ones. */
export const TEMPLATES: Record<Template, { label: string; nameLabel: string; fields: [string, FieldKind][] }> = {
  login: { label: 'Login', nameLabel: 'Name', fields: [['Username', 'text'], ['Password', 'secret'], ['Website', 'link']] },
  bank: {
    label: 'Bank',
    nameLabel: 'Bank',
    fields: [['Customer ID', 'text'], ['Account number', 'text'], ['Net-banking username', 'text'], ['Password', 'secret'], ['Transaction PIN', 'pin']],
  },
  card: { label: 'Card', nameLabel: 'Name', fields: [['Cardholder', 'text'], ['Card number', 'secret'], ['Expiry', 'text'], ['CVV', 'pin'], ['PIN', 'pin']] },
  wifi: { label: 'Wi-Fi', nameLabel: 'Network', fields: [['Password', 'secret'], ['Security type', 'text']] },
  note: { label: 'Secure note', nameLabel: 'Title', fields: [] },
};

/** Field ids only need to be unique within one entry. */
const fieldId = () => Math.random().toString(36).slice(2, 10);

export function blankEntry(template: Template): EntryData {
  return {
    template,
    name: '',
    fields: TEMPLATES[template].fields.map(([label, kind]) => ({ id: fieldId(), label, kind, value: '' })),
    notes: '',
    favourite: false,
    passwordHistory: [],
  };
}

/** The line under the entry's name in lists: its username or email. */
export const subtitle = (entry: EntryData) => entry.fields.find((f) => (f.kind === 'text' || f.kind === 'email') && f.value)?.value;

/** The password a list row's copy button copies. */
export const mainSecret = (entry: EntryData) => entry.fields.find((f) => f.kind === 'secret' && f.value);

/** What gets encrypted and saved: the name trimmed, fields left empty dropped. */
export const forSaving = (entry: EntryData): EntryData => ({
  ...entry,
  name: entry.name.trim(),
  fields: entry.fields.filter((f) => f.value.trim() !== ''),
});

/** Adds the old value of every hidden field that changed to the history, keeping the last few per field. */
export function recordHistory(before: EntryData, after: EntryData, now: Date): EntryData {
  const changed = before.fields
    .filter((old) => isHidden(old.kind) && old.value)
    .filter((old) => after.fields.find((f) => f.id === old.id)?.value !== old.value)
    .map((old) => ({ fieldId: old.id, label: old.label, value: old.value, changedAt: now.toISOString() }));
  const kept: PastValue[] = [];
  for (const past of [...changed, ...before.passwordHistory]) {
    if (kept.filter((k) => k.fieldId === past.fieldId).length < PASSWORD_HISTORY_MAX) kept.push(past);
  }
  return { ...after, passwordHistory: kept };
}
