import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

/*
 * Load the same env files Next.js does, in the same order of precedence.
 * `dotenv/config` alone would only read `.env`, so migrations would not see the
 * DATABASE_URL that the app itself picks up from `.env.local`.
 */
config({ path: ['.env.local', '.env'], quiet: true });

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
