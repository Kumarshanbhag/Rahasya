import { REVEAL_MS } from '@rahasya/config';
import { themes } from '@rahasya/tokens';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { EntryRow, SecretField, ThemeProvider } from '../../index';

const inTheme = (ui: ReactNode) => render(<ThemeProvider theme={themes.daylight}>{ui}</ThemeProvider>);

describe('SecretField', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('starts masked, always as 12 dots, so even the length stays private', async () => {
    await inTheme(<SecretField label="Password" value="hunter2" onCopy={jest.fn()} />);
    expect(screen.queryByText('hunter2')).toBeNull();
    expect(screen.getByText('••••••••••••')).toBeOnTheScreen();
  });

  it('shows the value on request and hides it again by itself after 20 seconds', async () => {
    await inTheme(<SecretField label="Password" value="hunter2" onCopy={jest.fn()} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Show Password' }));
    expect(screen.getByText('hunter2')).toBeOnTheScreen();
    await act(() => jest.advanceTimersByTime(REVEAL_MS));
    expect(screen.queryByText('hunter2')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show Password' })).toBeOnTheScreen();
  });

  it('copies without revealing, and confirms the copy', async () => {
    const onCopy = jest.fn();
    await inTheme(<SecretField label="Transaction PIN" value="4821" onCopy={onCopy} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy Transaction PIN' }));
    expect(onCopy).toHaveBeenCalledWith('4821');
    expect(screen.queryByText('4821')).toBeNull();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeOnTheScreen();
  });
});

describe('EntryRow', () => {
  it('opens the entry when pressed', async () => {
    const onPress = jest.fn();
    await inTheme(<EntryRow name="Netflix" subtitle="priya@example.com" onPress={onPress} />);
    expect(screen.getByText('priya@example.com')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Netflix' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('copies the password from the list without opening the entry', async () => {
    const onPress = jest.fn();
    const onCopy = jest.fn();
    await inTheme(<EntryRow name="Netflix" onPress={onPress} onCopy={onCopy} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Copy password for Netflix' }));
    expect(onCopy).toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('has no copy button when the entry has no password', async () => {
    await inTheme(<EntryRow name="Home Wi-Fi notes" onPress={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Copy password/ })).toBeNull();
  });
});
