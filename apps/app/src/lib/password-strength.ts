import type { StrengthScore } from '@rahasya/ui';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { adjacencyGraphs, dictionary } from '@zxcvbn-ts/language-common';

const estimator = new ZxcvbnFactory({ graphs: adjacencyGraphs, dictionary });

/** How hard a password is to guess, 0 (trivial) to 4 (very strong). `knownWords` (email, site name) count as guesses. */
export const strengthOf = (password: string, knownWords: string[] = []) => estimator.check(password, knownWords).score as StrengthScore;
