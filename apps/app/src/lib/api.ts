import { createApiClient } from '@rahasya/api-client';

/** Set EXPO_PUBLIC_API_URL in apps/app/.env (see .env.example); it's baked into the build. */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

export const api = createApiClient({ baseUrl: API_URL });
