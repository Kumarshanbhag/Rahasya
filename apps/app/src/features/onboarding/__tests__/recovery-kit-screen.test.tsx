import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Share } from 'react-native';
import { RecoveryKitScreen } from '../recovery-kit-screen';

jest.mock('@/features/session', () => ({ useSession: (select: (s: object) => unknown) => select({ email: 'priya@example.com' }) }));
jest.mock('@/lib/api', () => ({ API_URL: 'https://api.rahasya.app' }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

it('lists what is needed to find the account again: email and server', async () => {
  await render(<RecoveryKitScreen />);
  expect(screen.getByText('priya@example.com')).toBeOnTheScreen();
  expect(screen.getByText('https://api.rahasya.app')).toBeOnTheScreen();
});

it('saves the kit through the share sheet, with no password in it', async () => {
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  await render(<RecoveryKitScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save or print kit' }));
  const { message } = share.mock.calls[0]![0] as { message: string };
  expect(message).toContain('priya@example.com');
  expect(message).toContain('https://api.rahasya.app');
  expect(message).not.toMatch(/master password:/i);
});

it('moves on to the vault', async () => {
  await render(<RecoveryKitScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Continue to my vault' }));
  expect(router.replace).toHaveBeenCalledWith('/');
});
