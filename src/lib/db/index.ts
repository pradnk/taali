import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import { env } from '@/lib/env';
import * as schema from './schema';

let cached: ReturnType<typeof create> | undefined;

function create() {
  return drizzle(neon(env.databaseUrl), { schema });
}

/**
 * Lazily-created database client.
 *
 * Deliberately not a module-level constant: importing this file must not throw
 * when DATABASE_URL is absent, or `next build` fails before env vars exist.
 */
export function db() {
  cached ??= create();
  return cached;
}

export { schema };
