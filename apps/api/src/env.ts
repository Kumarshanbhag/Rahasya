import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

// Load apps/api/.env (same path from src/ and dist/) when present; variables already set in the environment win.
const file = join(__dirname, '..', '.env');
if (existsSync(file)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) process.env[key] ??= value;
}

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name} (see apps/api/.env.example)`);
  return value;
}
