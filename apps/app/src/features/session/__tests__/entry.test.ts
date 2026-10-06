import { screenFor } from '../entry';

it.each([
  ['signed-out', '/welcome'],
  ['locked', '/unlock'],
  ['unlocked', '/'],
  ['loading', null],
] as const)('a %s app opens on %s', (status, path) => {
  expect(screenFor(status)).toBe(path);
});
