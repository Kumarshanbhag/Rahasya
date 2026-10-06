export const triesLeftMessage = (triesLeft: number) => `Incorrect master password, ${triesLeft} ${triesLeft === 1 ? 'try' : 'tries'} left`;

export const waitMessage = (ms: number) => `Too many tries. Try again in ${Math.ceil(ms / 1000)} s.`;
