# @rahasya/motion (not started)

The app's animations, built on Reanimated 4 and React Native Skia (CanvasKit on the web). Every animation is assembled from a few shared building blocks, so they share timing, easing and the reduced-motion behaviour.

**Layout it will follow:**

```text
src/
  primitives/      the building blocks: orbit rings, cipher text (letters that scramble and decrypt),
                   glass orb, gradient underline, iris (a circle that opens or closes a screen), shared card
  animations/      one file per moment: splash, unlock, wrong password, auto-lock, copy, reveal, open entry,
                   add entry, update entry, delete, regenerate, theme switch, pull to sync
  timing.ts        easing curves and durations, read from @rahasya/config
  reduced-motion.ts  the final frame with a 200 ms fade when the system asks for less motion
  __tests__/
```

Rules each animation follows: 60 fps on a mid-range Android phone; anything longer than 1 s can be skipped with a tap; a quicker version after the third play; matches the reference animations within 50 ms. The numbers are in `MOTION` in `@rahasya/config`; the reference plays live in the [motion library](https://claude.ai/artifact/WjzKDR2Syfb3zcNvdzGJXd).
