import { ApiError } from '@rahasya/api-client';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SignUpScreen } from '../sign-up-screen';

const mockSignUp = jest.fn();
jest.mock('@/features/session', () => ({ useSession: (select: (s: object) => unknown) => select({ signUp: mockSignUp }) }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const STRONG = 'orbit candle mango thunder';

async function fillIn({ email = 'priya@example.com', password = STRONG, confirm = password }: { email?: string; password?: string; confirm?: string } = {}) {
  await render(<SignUpScreen />);
  await fireEvent.changeText(screen.getByLabelText('Email'), email);
  await fireEvent.changeText(screen.getByLabelText('Master password'), password);
  await fireEvent.changeText(screen.getByLabelText('Confirm master password'), confirm);
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
}

beforeEach(() => mockSignUp.mockReset().mockResolvedValue(undefined));

it('warns that nobody can reset the master password before it is chosen', async () => {
  await render(<SignUpScreen />);
  expect(screen.getByText(/No one can reset your master password/)).toBeOnTheScreen();
});

it('rates the master password while it is typed', async () => {
  await render(<SignUpScreen />);
  await fireEvent.changeText(screen.getByLabelText('Master password'), 'password1234');
  expect(screen.getByText('Weak')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Master password'), STRONG);
  expect(screen.getByText(/strong/i)).toBeOnTheScreen();
});

it.each([
  ['an invalid email', { email: 'priya@' }, 'Enter a valid email address'],
  ['a short master password', { password: 'short' }, 'Use at least 12 characters'],
  ['a guessable master password', { password: 'password1234' }, 'Too easy to guess. Add more unrelated words.'],
  ['a confirmation that differs', { confirm: `${STRONG}!` }, "The passwords don't match"],
])('explains %s instead of creating the account', async (_, input, message) => {
  await fillIn(input);
  expect(screen.getByText(message)).toBeOnTheScreen();
  expect(mockSignUp).not.toHaveBeenCalled();
});

it('creates the account, then shows the recovery kit', async () => {
  await fillIn();
  expect(mockSignUp).toHaveBeenCalledWith('priya@example.com', STRONG);
  expect(router.replace).toHaveBeenCalledWith('/signup/recovery-kit');
});

it('shows what went wrong when the server refuses', async () => {
  mockSignUp.mockRejectedValue(new ApiError(409, 'An account with this email already exists'));
  await fillIn();
  expect(screen.getByText('An account with this email already exists')).toBeOnTheScreen();
  expect(router.replace).not.toHaveBeenCalled();
});

it('offers sign-in to people who already have an account', async () => {
  await render(<SignUpScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'I already have an account' }));
  expect(router.replace).toHaveBeenCalledWith('/signin');
});
