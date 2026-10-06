import { act, renderHook } from '@testing-library/react-native';
import * as ReactNative from 'react-native';
import { Uniwind } from 'uniwind';
import { useThemeChoice } from '../theme-choice';
import { useApplyTheme, useChosenTheme } from '../use-theme';

function deviceIs(scheme: 'light' | 'dark') {
  jest.spyOn(ReactNative, 'useColorScheme').mockReturnValue(scheme);
}

async function themeOnScreen() {
  const { result } = await renderHook(() => useChosenTheme());
  return result.current;
}

beforeEach(async () => {
  jest.mocked(Uniwind.setTheme).mockClear();
  await act(() => useThemeChoice.setState({ mode: 'auto', nightTheme: 'glass-wallet' }));
});

it('starts on Auto: Daylight while the device is in light mode', async () => {
  deviceIs('light');
  expect((await themeOnScreen()).id).toBe('daylight');
});

it('Auto switches to the chosen night theme when the device goes dark', async () => {
  deviceIs('dark');
  await act(() => useThemeChoice.getState().setNightTheme('holographic'));
  expect((await themeOnScreen()).name).toBe('Holographic');
});

it('Light and Dark ignore the device setting', async () => {
  deviceIs('dark');
  await act(() => useThemeChoice.getState().setMode('light'));
  expect((await themeOnScreen()).id).toBe('daylight');
  deviceIs('light');
  await act(() => useThemeChoice.getState().setMode('dark'));
  expect((await themeOnScreen()).id).toBe('glass-wallet');
});

it('switches every class-name style in the app to the same theme', async () => {
  deviceIs('light');
  const { rerender } = await renderHook(() => useApplyTheme());
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('daylight');
  await act(() => useThemeChoice.getState().setMode('dark'));
  await rerender({});
  expect(Uniwind.setTheme).toHaveBeenLastCalledWith('glass-wallet');
});
