import { execSync } from 'node:child_process';
import './setup-env';

/** Bring the test database up to the latest migration. Tests use fresh random accounts, so no wipe is needed. */
export default function globalSetup() {
  execSync('pnpm exec prisma migrate deploy', { stdio: 'ignore', env: process.env });
}
