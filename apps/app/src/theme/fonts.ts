import { fontFamily } from '@rahasya/tokens';

/** Bundled with the app, never fetched, so text renders the same offline and on first launch. */
export const fonts = {
  [fontFamily.outfit]: require('../../assets/fonts/Outfit-Regular.ttf'),
  [fontFamily.outfitSemiBold]: require('../../assets/fonts/Outfit-SemiBold.ttf'),
  [fontFamily.sora]: require('../../assets/fonts/Sora-Regular.ttf'),
  [fontFamily.soraSemiBold]: require('../../assets/fonts/Sora-SemiBold.ttf'),
  [fontFamily.mono]: require('../../assets/fonts/DMMono-Medium.ttf'),
};
