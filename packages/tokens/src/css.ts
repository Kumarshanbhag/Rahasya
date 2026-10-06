import { radius } from './spacing';
import { daylight } from './themes/daylight';
import { glassWallet } from './themes/glass-wallet';
import { themes, type Theme } from './themes';
import { fontSize } from './typography';

const kebab = (name: string) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * One theme as CSS variables. Each --color-x becomes the classes bg-x, text-x, border-x;
 * each --font-x becomes font-x. Gradients and aurora lights stay in TypeScript: components draw them.
 */
export function themeVariables(theme: Theme): Record<string, string> {
  const { aurora, accentGradient, accentAngle, surface, ...flat } = theme.color;
  const vars: Record<string, string> = {};
  for (const [key, value] of Object.entries(flat)) vars[`--color-${kebab(key)}`] = value;
  vars['--color-surface'] = surface[0];
  vars['--font-heading'] = theme.font.heading;
  vars['--font-body'] = theme.font.body;
  vars['--font-mono'] = theme.font.mono;
  return vars;
}

const block = (selector: string, vars: Record<string, string | number>, indent: string) =>
  `${indent}${selector} {\n${Object.entries(vars).map(([k, v]) => `${indent}  ${k}: ${v};`).join('\n')}\n${indent}}`;

/**
 * The stylesheet every app imports. Static sizes go in @theme; colours and fonts go in one variant per theme,
 * and switching theme at runtime swaps the variant. light and dark mirror Daylight and Glass wallet so the
 * very first frame, before the user's saved choice loads, is already styled.
 */
export function themeCss() {
  const statics: Record<string, string> = {};
  for (const [name, px] of Object.entries(radius)) statics[`--radius-${name}`] = `${px}px`;
  for (const [name, px] of Object.entries(fontSize)) statics[`--text-${name}`] = `${px}px`;

  const variants: [string, Theme][] = [['light', daylight], ['dark', glassWallet], ...Object.values(themes).map((t): [string, Theme] => [t.id, t])];
  return [
    '/* Generated from packages/tokens/src by `pnpm --filter @rahasya/tokens build`. Edit the TypeScript, not this file. */',
    '',
    block('@theme', statics, ''),
    '',
    '@layer theme {',
    '  :root {',
    variants.map(([name, theme]) => block(`@variant ${name}`, themeVariables(theme), '    ')).join('\n\n'),
    '  }',
    '}',
    '',
  ].join('\n');
}
