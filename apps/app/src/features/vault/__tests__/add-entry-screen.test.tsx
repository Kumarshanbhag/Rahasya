import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AddEntryScreen } from '../add-entry-screen';
import type { EntryData } from '../entry';

const mockSave = jest.fn();
jest.mock('@/features/vault', () => ({ useVault: (select: (s: object) => unknown) => select({ save: mockSave }) }));
jest.mock('@rahasya/crypto', () => ({ generatePassword: () => 'G3nerated!Pass#9' }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const saved = () => mockSave.mock.calls[0]![0].data as EntryData;
const valueOf = (data: EntryData, label: string) => data.fields.find((f) => f.label === label)?.value;

beforeEach(() => mockSave.mockResolvedValue({ id: 'e1', conflict: false }));

it('starts as a login: name, username, password, website', async () => {
  await render(<AddEntryScreen />);
  expect(screen.getByRole('button', { name: 'Login' })).toBeSelected();
  for (const label of ['Name', 'Username', 'Password', 'Website', 'Notes']) expect(screen.getByLabelText(label)).toBeOnTheScreen();
});

it('switches the fields when another kind of entry is chosen', async () => {
  await render(<AddEntryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Bank' }));
  expect(screen.getByLabelText('Bank')).toBeOnTheScreen();
  expect(screen.getByLabelText('Transaction PIN')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Website')).toBeNull();
});

it('only needs a name', async () => {
  await render(<AddEntryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save to vault' }));
  expect(screen.getByText('Give this entry a name')).toBeOnTheScreen();
  expect(mockSave).not.toHaveBeenCalled();
});

it('generates a strong password on request and rates it', async () => {
  await render(<AddEntryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Generate Password' }));
  expect(screen.getByLabelText('Password')).toHaveDisplayValue('G3nerated!Pass#9');
  expect(screen.getByLabelText('Password strength')).toBeOnTheScreen();
});

it('saves what was typed, then goes back to the vault', async () => {
  await render(<AddEntryScreen />);
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Netflix');
  await fireEvent.changeText(screen.getByLabelText('Username'), 'priya@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'hunter2 hunter2');
  await fireEvent.changeText(screen.getByLabelText('Notes'), 'Family plan');
  await fireEvent.press(screen.getByRole('button', { name: 'Save to vault' }));

  expect(saved()).toMatchObject({ template: 'login', name: 'Netflix', notes: 'Family plan' });
  expect(valueOf(saved(), 'Username')).toBe('priya@example.com');
  expect(valueOf(saved(), 'Password')).toBe('hunter2 hunter2');
  expect(router.back).toHaveBeenCalled();
});

it('keeps the form and explains when saving fails', async () => {
  mockSave.mockRejectedValue(new Error("Can't reach Rahasya. Check your connection and try again."));
  await render(<AddEntryScreen />);
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Netflix');
  await fireEvent.press(screen.getByRole('button', { name: 'Save to vault' }));
  expect(screen.getByText("Can't reach Rahasya. Check your connection and try again.")).toBeOnTheScreen();
  expect(screen.getByLabelText('Name')).toHaveDisplayValue('Netflix');
  expect(router.back).not.toHaveBeenCalled();
});

it('cancels without saving', async () => {
  await render(<AddEntryScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(router.back).toHaveBeenCalled();
  expect(mockSave).not.toHaveBeenCalled();
});
