import { ApiError } from '@rahasya/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SignInScreen } from '../sign-in-screen';

const mockSignIn = jest.fn();
jest.mock('@/features/session', () => ({ useSession: (select: (s: object) => unknown) => select({ signIn: mockSignIn }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

async function signIn() {
  await fireEvent.changeText(screen.getByLabelText('Email'), 'priya@example.com');
  await fireEvent.changeText(screen.getByLabelText('Master password'), 'orbit candle mango thunder');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(() => mockSignIn.mockResolvedValue(undefined));

it('signs in and opens the vault', async () => {
  await render(<SignInScreen />);
  await signIn();
  expect(mockSignIn).toHaveBeenCalledWith('priya@example.com', 'orbit candle mango thunder', undefined);
  expect(router.replace).toHaveBeenCalledWith('/');
});

it('says how many tries are left after a wrong master password', async () => {
  mockSignIn.mockRejectedValue(new ApiError(401, 'Incorrect master password', { triesLeft: 4 }));
  await render(<SignInScreen />);
  await signIn();
  expect(screen.getByText('Incorrect master password, 4 tries left')).toBeOnTheScreen();
  expect(router.replace).not.toHaveBeenCalled();
});

it('asks for the two-step code when the account uses one, then sends it', async () => {
  mockSignIn.mockRejectedValueOnce(new ApiError(401, 'Enter your two-step code', { triesLeft: 4, twoFactorRequired: true }));
  await render(<SignInScreen />);
  await signIn();
  await fireEvent.changeText(screen.getByLabelText('Two-step code'), '123456');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(mockSignIn).toHaveBeenLastCalledWith('priya@example.com', 'orbit candle mango thunder', '123456');
  expect(router.replace).toHaveBeenCalledWith('/');
});

it('says how long to wait after too many tries', async () => {
  mockSignIn.mockRejectedValue(new ApiError(429, 'Too many attempts. Try again shortly.', { retryAfterMs: 26_400 }));
  await render(<SignInScreen />);
  await signIn();
  expect(screen.getByText('Too many tries. Try again in 27 s.')).toBeOnTheScreen();
});

it('explains a lost connection', async () => {
  mockSignIn.mockRejectedValue(new ApiError(0, "Can't reach Rahasya. Check your connection and try again."));
  await render(<SignInScreen />);
  await signIn();
  expect(screen.getByText("Can't reach Rahasya. Check your connection and try again.")).toBeOnTheScreen();
});
