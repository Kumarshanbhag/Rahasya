import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { WelcomeScreen } from '../welcome-screen';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

it('introduces Rahasya to someone opening it for the first time', async () => {
  await render(<WelcomeScreen />);
  expect(screen.getByRole('header', { name: 'Rahasya' })).toBeOnTheScreen();
  expect(screen.getByText('Your secrets, safely yours.')).toBeOnTheScreen();
});

it('leads new people to create an account', async () => {
  await render(<WelcomeScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
  expect(router.push).toHaveBeenCalledWith('/signup');
});

it('lets people who already have an account sign in', async () => {
  await render(<WelcomeScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(router.push).toHaveBeenCalledWith('/signin');
});
