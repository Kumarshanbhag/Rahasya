import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { copySecret } from '@/lib/clipboard';
import { blankEntry } from '../entry';
import { EntryScreen } from '../entry-screen';
import type { Entry } from '../vault-store';

const mockSave = jest.fn();
const mockTrash = jest.fn();
let mockEntries: Record<string, Entry> = {};
jest.mock('@/features/vault', () => ({ useVault: (select: (s: object) => unknown) => select({ entries: mockEntries, save: mockSave, trash: mockTrash }) }));
jest.mock('@/lib/clipboard', () => ({ copySecret: jest.fn() }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => ({ id: 'e1' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

beforeEach(() => {
  const data = blankEntry('bank');
  data.name = 'HDFC Bank';
  data.fields[2]!.value = 'priya.s84';
  data.fields[3]!.value = 'Qv7#mR2!tL9x';
  data.fields[4]!.value = '4821';
  data.passwordHistory = [{ fieldId: data.fields[3]!.id, label: 'Password', value: 'older password', changedAt: '2026-09-01T00:00:00.000Z' }];
  mockEntries = { e1: { id: 'e1', data, groupId: null, labelIds: [], revision: 3, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', deletedAt: null } };
  mockSave.mockResolvedValue({ id: 'e1', conflict: false });
  mockTrash.mockResolvedValue(undefined);
});

it('shows the entry with visible fields in full and hidden ones masked', async () => {
  await render(<EntryScreen />);
  expect(screen.getByRole('header', { name: 'HDFC Bank' })).toBeOnTheScreen();
  expect(screen.getByText('priya.s84')).toBeOnTheScreen();
  expect(screen.queryByText('Qv7#mR2!tL9x')).toBeNull();
  expect(screen.queryByText('4821')).toBeNull();
  expect(screen.getByRole('button', { name: 'Show Transaction PIN' })).toBeOnTheScreen();
});

it('copies the transaction PIN without showing it', async () => {
  await render(<EntryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Copy Transaction PIN' }));
  expect(copySecret).toHaveBeenCalledWith('4821');
  expect(screen.queryByText('4821')).toBeNull();
});

it('copies a visible value too', async () => {
  await render(<EntryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Copy Net-banking username' }));
  expect(copySecret).toHaveBeenCalledWith('priya.s84');
});

it('stars and unstars the entry', async () => {
  await render(<EntryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add to favourites' }));
  expect(mockSave).toHaveBeenCalledWith({ id: 'e1', data: expect.objectContaining({ favourite: true }), groupId: null, labelIds: [] });
});

it('lists earlier passwords, masked', async () => {
  await render(<EntryScreen />);
  expect(screen.getByText('Earlier passwords')).toBeOnTheScreen();
  expect(screen.queryByText('older password')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: /^Copy Password, changed / }));
  expect(copySecret).toHaveBeenCalledWith('older password');
});

it('moves the entry to Trash and goes back', async () => {
  await render(<EntryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Move to Trash' }));
  expect(mockTrash).toHaveBeenCalledWith('e1');
  expect(router.back).toHaveBeenCalled();
});

it('says so when the entry is gone', async () => {
  mockEntries = {};
  await render(<EntryScreen />);
  expect(screen.getByText("This entry isn't in your vault")).toBeOnTheScreen();
});
