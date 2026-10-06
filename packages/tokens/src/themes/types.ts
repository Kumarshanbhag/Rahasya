/** Stable id used in code, in the generated CSS and when the user's choice is saved on the device. */
export type ThemeId = 'glass-wallet' | 'daylight' | 'holographic' | 'console';

/** The themes a user can pick for night time; daytime is always Daylight. */
export type NightThemeId = 'glass-wallet' | 'holographic';

export type ThemeMode = 'light' | 'dark' | 'auto';

export type Theme = {
  id: ThemeId;
  /** Shown to people, for example in Settings. */
  name: string;
  /** The design's code for this theme (D9, D10, D14), for cross-checking against the mockups. */
  code: string;
  dark: boolean;
  color: {
    background: string;
    /** Soft blurred lights drawn behind the content. */
    aurora: string[];
    foreground: string;
    /** Secondary text: captions, hints, labels. */
    muted: string;
    /** Solid accent for icons, links and highlighted text. */
    accent: string;
    /** Gradient for primary buttons, rings and the keyhole. */
    accentGradient: string[];
    accentAngle: number;
    /** Text and icons drawn on the accent gradient. */
    onAccent: string;
    /** Fill for icon buttons, chips and tracks. */
    soft: string;
    selected: string;
    warning: string;
    danger: string;
    dangerSoft: string;
    success: string;
    /** Glass card fill, top-left to bottom-right. */
    surface: [string, string];
    /** The 1 px edge around glass cards. */
    surfaceEdge: string;
    orbGlow: string;
    /** The specular highlight on the glass orb. */
    orbShine: string;
  };
  font: { heading: string; body: string; mono: string };
};
