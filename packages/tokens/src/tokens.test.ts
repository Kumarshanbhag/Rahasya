import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio, themeCss, themeFor, themes, themeVariables } from './index';

const all = Object.values(themes);

describe('themes', () => {
  it.each(all)('$name keeps body text, secondary text and accent text readable (at least 4.5:1)', ({ color }) => {
    expect(contrastRatio(color.foreground, color.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color.muted, color.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(color.accent, color.background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(all)('$name keeps warning, danger and success visible (at least 3:1)', ({ color }) => {
    for (const c of [color.warning, color.danger, color.success]) expect(contrastRatio(c, color.background)).toBeGreaterThanOrEqual(3);
  });

  it('every theme has a readable name and its design code', () => {
    expect(all.map((t) => [t.id, t.name, t.code])).toEqual([
      ['glass-wallet', 'Glass wallet', 'D9'],
      ['daylight', 'Daylight', 'D10'],
      ['holographic', 'Holographic', 'D14'],
      ['console', 'Admin console', 'Admin'],
    ]);
  });

  it('measures contrast the WCAG way', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});

describe('themeFor', () => {
  it('Light always uses Daylight', () => {
    expect(themeFor({ mode: 'light', systemScheme: 'dark', nightTheme: 'holographic' }).id).toBe('daylight');
  });

  it('Dark uses the night theme the user picked', () => {
    expect(themeFor({ mode: 'dark', systemScheme: 'light', nightTheme: 'holographic' }).id).toBe('holographic');
    expect(themeFor({ mode: 'dark', systemScheme: 'light', nightTheme: 'glass-wallet' }).id).toBe('glass-wallet');
  });

  it('Auto follows the device: Daylight by day, the chosen night theme at night', () => {
    expect(themeFor({ mode: 'auto', systemScheme: 'light', nightTheme: 'glass-wallet' }).id).toBe('daylight');
    expect(themeFor({ mode: 'auto', systemScheme: 'dark', nightTheme: 'glass-wallet' }).id).toBe('glass-wallet');
    expect(themeFor({ mode: 'auto', systemScheme: null, nightTheme: 'glass-wallet' }).id).toBe('daylight');
  });
});

describe('generated CSS', () => {
  it('defines the same variables in every theme, so switching never leaves a gap', () => {
    const names = all.map((t) => Object.keys(themeVariables(t)).sort());
    for (const n of names) expect(n).toEqual(names[0]);
  });

  it('gives each theme a variant, plus light and dark for the first frame before the saved choice loads', () => {
    const css = themeCss();
    for (const variant of ['light', 'dark', 'glass-wallet', 'daylight', 'holographic', 'console']) expect(css).toContain(`@variant ${variant} {`);
    expect(css).toContain('--color-background: #F5F3FA;');
    expect(css).toContain('--radius-card: 22px;');
  });

  it('is up to date: run `pnpm --filter @rahasya/tokens build` after changing a token', () => {
    expect(readFileSync(join(__dirname, '..', 'theme.css'), 'utf8')).toBe(themeCss());
  });
});
