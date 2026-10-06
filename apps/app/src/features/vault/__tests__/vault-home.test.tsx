import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { copySecret } from '@/lib/clipboard';
import { blankEntry } from '../entry';
import type { Entry } from '../vault-store';
import { VaultHome } from '../vault-home';

const mockLock = jest.fn();
const mockSync = jest.fn();
let mockEntries: Record<string, Entry> = {};
jest.mock('@/features/session', () => ({ useSession: (select: (s: object) => unknown) => select({ email: 'priya@example.com', lock: mockLock }) }));
jest.mock('@/features/vault', () => ({ useVault: (select: (s: object) => unknown) => select({ entries: mockEntries, sync: mockSync }) }));
jest.mock('@/lib/clipboard', () => ({ copySecret: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

function entry(id: string, name: string, username: string, password = ''): Entry {
  const data = blankEntry('login');
  data.name = name;
  data.fields[0]!.value = username;
  data.fields[1]!.value = password;
  return { id, data, groupId: null, labelIds: [], revision: 1, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', deletedAt: null };
}

beforeEach(() => {
  mockSync.mockResolvedValue(undefined);
  mockEntries = {
    a: entry('a', 'Netflix', 'priya@example.com', 'hunter2'),
    b: entry('b', 'Amazon', 'priya.shop'),
  };
});

it('invites a new user to add their first entry', async () => {
  mockEntries = {};
  await render(<VaultHome />);
  expect(screen.getByText('Your vault is empty')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Add your first password' }));
  expect(router.push).toHaveBeenCalledWith('/entry/new');
});

it('fetches the latest changes when it opens', async () => {
  await render(<VaultHome />);
  expect(mockSync).toHaveBeenCalled();
});

it('lists entries A to Z with their usernames', async () => {
  await render(<VaultHome />);
  const rows = screen.getAllByRole('button', { name: /^(Amazon|Netflix)$/ });
  expect(rows.map((r) => r.props.accessibilityLabel)).toEqual(['Amazon', 'Netflix']);
  expect(screen.getByText('priya.shop')).toBeOnTheScreen();
});

it('switches the order from the sort button', async () => {
  await render(<VaultHome />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sort: Name A to Z' }));
  expect(screen.getAllByRole('button', { name: /^(Amazon|Netflix)$/ }).map((r) => r.props.accessibilityLabel)).toEqual(['Netflix', 'Amazon']);
  expect(screen.getByRole('button', { name: 'Sort: Name Z to A' })).toBeOnTheScreen();
});

it('narrows the list as the user searches, and says when nothing matches', async () => {
  await render(<VaultHome />);
  await fireEvent.changeText(screen.getByLabelText('Search'), 'net');
  expect(screen.queryByRole('button', { name: 'Amazon' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Search'), 'xyz');
  expect(screen.getByText("No matches for 'xyz'")).toBeOnTheScreen();
});

it('opens an entry', async () => {
  await render(<VaultHome />);
  await fireEvent.press(screen.getByRole('button', { name: 'Netflix' }));
  expect(router.push).toHaveBeenCalledWith('/entry/a');
});

it('copies a password straight from the list, without opening the entry', async () => {
  await render(<VaultHome />);
  expect(screen.queryByRole('button', { name: 'Copy password for Amazon' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Copy password for Netflix' }));
  expect(copySecret).toHaveBeenCalledWith('hunter2');
  expect(screen.getByText('Password copied. Clears in 30 s.')).toBeOnTheScreen();
  expect(router.push).not.toHaveBeenCalled();
});

it('adds an entry and locks the vault from the header', async () => {
  await render(<VaultHome />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add entry' }));
  expect(router.push).toHaveBeenCalledWith('/entry/new');
  await fireEvent.press(screen.getByRole('button', { name: 'Lock' }));
  expect(mockLock).toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/unlock');
});

it('says so when syncing fails, and keeps what it has', async () => {
  mockSync.mockRejectedValue(new Error("Can't reach Rahasya. Check your connection and try again."));
  await render(<VaultHome />);
  expect(await screen.findByText("Can't reach Rahasya. Check your connection and try again.")).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Netflix' })).toBeOnTheScreen();
});
