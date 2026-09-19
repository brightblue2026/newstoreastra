import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 no longer reads `.env` on its own, and no longer accepts the
 * connection URL inside `schema.prisma`. Both live here.
 *
 * Node's built-in loader is used rather than a dotenv dependency. A missing
 * `.env` is not an error: the schema still validates and the client still
 * generates without a database, which is what CI and a fresh checkout need.
 */
try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // No .env present. Only the commands that actually talk to Postgres will fail.
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    /**
     * Migrations go over the DIRECT connection, never the pooler.
     *
     * Supabase's pooled port (6543) runs pgBouncer in transaction mode, which
     * cannot carry the session-level state `prisma migrate` needs — advisory
     * locks, prepared statements and DDL across statements. Pointing migrations
     * at it produces hangs and "prepared statement already exists" rather than
     * a clean error, so the direct port (5432) is preferred here while the app
     * itself keeps using the pooled `DATABASE_URL` at runtime.
     *
     * Falls back to `DATABASE_URL` for a plain unpooled Postgres, which is
     * what local development uses.
     */
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '',
  },
});
