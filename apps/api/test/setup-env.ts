import '../src/env';

// Tests always run against TEST_DATABASE_URL, never the dev database.
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('Set TEST_DATABASE_URL in apps/api/.env (see .env.example)');
process.env.DATABASE_URL = url;

// Admin console and recovery settings the tests rely on.
process.env.ADMIN_RP_ID ??= 'localhost';
process.env.ADMIN_ORIGIN ??= 'http://localhost:3001';
process.env.ADMIN_IP_ALLOWLIST = '*';
process.env.RECOVERY_WAIT_HOURS = '48';
process.env.RECOVERY_PUBLIC_KEY ||= Buffer.alloc(32, 7).toString('base64');
