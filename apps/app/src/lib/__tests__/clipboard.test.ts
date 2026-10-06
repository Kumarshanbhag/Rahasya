import { CLIPBOARD_CLEAR_MS } from '@rahasya/config';
import * as Clipboard from 'expo-clipboard';
import { copySecret } from '../clipboard';

jest.mock('expo-clipboard', () => {
  let text = '';
  return {
    setStringAsync: jest.fn(async (t: string) => ((text = t), true)),
    getStringAsync: jest.fn(async () => text),
  };
});

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('copies the value, then clears the clipboard after 30 seconds', async () => {
  await copySecret('Qv7#mR2!tL9x');
  expect(await Clipboard.getStringAsync()).toBe('Qv7#mR2!tL9x');
  await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS - 1);
  expect(await Clipboard.getStringAsync()).toBe('Qv7#mR2!tL9x');
  await jest.advanceTimersByTimeAsync(1);
  expect(await Clipboard.getStringAsync()).toBe('');
});

it('leaves the clipboard alone if the person has copied something else since', async () => {
  await copySecret('Qv7#mR2!tL9x');
  await Clipboard.setStringAsync('a recipe link');
  await jest.advanceTimersByTimeAsync(CLIPBOARD_CLEAR_MS);
  expect(await Clipboard.getStringAsync()).toBe('a recipe link');
});
