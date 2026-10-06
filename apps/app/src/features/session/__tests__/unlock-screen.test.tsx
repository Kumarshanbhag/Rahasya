import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { UnlockFailed } from '../unlock-failed';
import { UnlockScreen } from '../unlock-screen';

const mockUnlock = jest.fn();
const mockSignOut = jest.fn();
jest.mock('@/features/session', () => ({
  useSession: (select: (s: object) => unknown) => select({ email: 'priya@example.com', unlock: mockUnlock, signOut: mockSignOut }),
}));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

async function tryPassword(password = 'orbit candle mango thunder') {
  await fireEvent.changeText(screen.getByLabelText('Master password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));
}

beforeEach(() => mockUnlock.mockResolvedValue(undefined));

it('greets the person whose vault this is', async () => {
  await render(<UnlockScreen />);
  expect(screen.getByText('Welcome back')).toBeOnTheScreen();
  expect(screen.getByText('priya@example.com')).toBeOnTheScreen();
});

it('opens the vault with the right master password', async () => {
  await render(<UnlockScreen />);
  await tryPassword();
  expect(mockUnlock).toHaveBeenCalledWith('orbit candle mango thunder');
  expect(router.replace).toHaveBeenCalledWith('/');
});

it('says how many tries are left, and clears the field', async () => {
  mockUnlock.mockRejectedValue(new UnlockFailed(1));
  await render(<UnlockScreen />);
  await tryPassword('wrong password!!');
  expect(screen.getByText('Incorrect master password, 1 try left')).toBeOnTheScreen();
  expect(screen.getByLabelText('Master password')).toHaveDisplayValue('');
});

it('after the last try, counts down 30 s before unlocking is possible again', async () => {
  jest.useFakeTimers();
  mockUnlock.mockRejectedValue(new UnlockFailed(0, 30_000));
  await render(<UnlockScreen />);
  await tryPassword('wrong password!!');
  expect(screen.getByText('Too many tries. Try again in 30 s.')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();

  await act(() => jest.advanceTimersByTime(29_000));
  expect(screen.getByText('Too many tries. Try again in 1 s.')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(1_000));
  await fireEvent.changeText(screen.getByLabelText('Master password'), 'orbit candle mango thunder');
  expect(screen.getByRole('button', { name: 'Unlock' })).toBeEnabled();
  jest.useRealTimers();
});

it('lets someone else sign in on this device instead', async () => {
  await render(<UnlockScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign out of this device' }));
  expect(mockSignOut).toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith('/welcome');
});
