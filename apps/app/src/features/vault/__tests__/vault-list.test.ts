import { blankEntry } from '../entry';
import { visibleEntries } from '../vault-list';
import type { Entry } from '../vault-store';

function entry(id: string, name: string, createdAt: string, username = '', password = '', deletedAt: string | null = null): Entry {
  const data = blankEntry('login');
  data.name = name;
  data.fields[0]!.value = username;
  data.fields[1]!.value = password;
  return { id, data, groupId: null, labelIds: [], revision: 1, createdAt, updatedAt: createdAt, deletedAt };
}

const entries = Object.fromEntries(
  [
    entry('a', 'netflix', '2026-10-03T00:00:00Z', 'priya@example.com', 'hunter2'),
    entry('b', 'Amazon', '2026-10-01T00:00:00Z', 'priya.shop'),
    entry('c', 'Gmail', '2026-10-02T00:00:00Z', 'priya@gmail.com'),
    entry('d', 'Old bank', '2026-09-01T00:00:00Z', '', '', '2026-10-05T00:00:00Z'),
  ].map((e) => [e.id, e]),
);
const names = (list: Entry[]) => list.map((e) => e.data.name);

it('lists entries A to Z by default, ignoring case and leaving out Trash', () => {
  expect(names(visibleEntries(entries, { search: '', sort: 'name-asc' }))).toEqual(['Amazon', 'Gmail', 'netflix']);
});

it('sorts Z to A, newest first and oldest first', () => {
  expect(names(visibleEntries(entries, { search: '', sort: 'name-desc' }))).toEqual(['netflix', 'Gmail', 'Amazon']);
  expect(names(visibleEntries(entries, { search: '', sort: 'newest' }))).toEqual(['netflix', 'Gmail', 'Amazon']);
  expect(names(visibleEntries(entries, { search: '', sort: 'oldest' }))).toEqual(['Amazon', 'Gmail', 'netflix']);
});

it('searches names, usernames and field labels', () => {
  expect(names(visibleEntries(entries, { search: 'GMAIL', sort: 'name-asc' }))).toEqual(['Gmail']);
  expect(names(visibleEntries(entries, { search: 'shop', sort: 'name-asc' }))).toEqual(['Amazon']);
});

it('never matches on a hidden value, so typing a password finds nothing', () => {
  expect(visibleEntries(entries, { search: 'hunter2', sort: 'name-asc' })).toEqual([]);
});
