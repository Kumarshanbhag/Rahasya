// Class names are compiled by Metro at build time; in tests only the theme switch matters.
jest.mock('uniwind', () => ({ Uniwind: { setTheme: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
