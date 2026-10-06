import { CLIPBOARD_CLEAR_MS } from '@rahasya/config';
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

/**
 * Copies a secret and wipes it from the clipboard 30 seconds later, unless something else was copied since.
 * TODO: on Android 13+ also flag the clip as sensitive so the system preview hides it; expo-clipboard has no
 * option for that yet, so it needs a small native add-on.
 */
export async function copySecret(value: string) {
  await Clipboard.setStringAsync(value);
  setTimeout(async () => {
    // Reading the clipboard on the web asks the user for permission, so there it is cleared unconditionally.
    if (Platform.OS === 'web' || (await Clipboard.getStringAsync()) === value) await Clipboard.setStringAsync('');
  }, CLIPBOARD_CLEAR_MS);
}
