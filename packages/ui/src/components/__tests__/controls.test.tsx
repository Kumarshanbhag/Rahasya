import { themes } from '@rahasya/tokens';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Button, StrengthMeter, TextField, ThemeProvider } from '../../index';

const inTheme = (ui: ReactNode) => render(<ThemeProvider theme={themes.daylight}>{ui}</ThemeProvider>);

describe('Button', () => {
  it('is announced as a button and runs its action when pressed', async () => {
    const onPress = jest.fn();
    await inTheme(<Button title="Create account" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled or busy, and says why', async () => {
    const onPress = jest.fn();
    await inTheme(
      <>
        <Button title="Save" onPress={onPress} disabled />
        <Button title="Unlock" onPress={onPress} loading />
      </>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Unlock' }));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeBusy();
  });
});

describe('TextField', () => {
  it('is found by its label and reports typing', async () => {
    const onChangeText = jest.fn();
    await inTheme(<TextField label="Email" value="" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Email'), 'priya@example.com');
    expect(onChangeText).toHaveBeenCalledWith('priya@example.com');
  });

  it('hides a secret until the eye is pressed, and hides it again on the second press', async () => {
    await inTheme(<TextField label="Master password" value="correct horse" onChangeText={() => {}} secret />);
    expect(screen.getByLabelText('Master password')).toHaveProp('secureTextEntry', true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Master password')).toHaveProp('secureTextEntry', false);
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Master password')).toHaveProp('secureTextEntry', true);
  });

  it('shows an error under the field', async () => {
    await inTheme(<TextField label="Email" value="x" onChangeText={() => {}} error="Enter a valid email" />);
    expect(screen.getByText('Enter a valid email')).toBeOnTheScreen();
  });
});

describe('StrengthMeter', () => {
  it.each([
    [0, 'Weak'],
    [1, 'Weak'],
    [2, 'Fair'],
    [3, 'Strong'],
    [4, 'Very strong'],
  ] as const)('score %i reads "%s", in words as well as colour', async (score, label) => {
    await inTheme(<StrengthMeter score={score} />);
    expect(screen.getByText(label)).toBeOnTheScreen();
  });
});
