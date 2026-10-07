import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { pgPoolConfig } from './pg-config';

/**
 * The Prisma client. Import this — never construct a `PrismaClient` anywhere
 * else.
 *
 * Two things this handles:
 *
 * 1. Next.js hot-reloads modules in development, so a module-level client
 *    would open a new pool on every save until Postgres refuses connections.
 *    The instance is cached on `globalThis` to survive reloads.
 * 2. The client is created on first use rather than on import. `next build`
 *    evaluates route modules without a database, and a missing DATABASE_URL
 *    should fail the request that needs it, not the build.
 */

declare global {
  var __bbPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and add the Supabase connection string.',
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg(pgPoolConfig(connectionString)),
    // Queries are noisy; warnings and errors are not.
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

function getClient(): PrismaClient {
  if (!globalThis.__bbPrisma) {
    globalThis.__bbPrisma = createClient();
  }
  return globalThis.__bbPrisma;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    return Reflect.get(getClient(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getClient(), property);
  },
  set(_target, property, value) {
    return Reflect.set(getClient(), property, value);
  },
});
