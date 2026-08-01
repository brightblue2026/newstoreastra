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
    seed: 'node --experimental-strip-types prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
