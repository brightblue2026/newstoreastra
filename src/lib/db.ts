import { getCloudflareContext } from '@opennextjs/cloudflare';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { pgPoolConfig } from './pg-config';

/**
 * The Prisma client. Import this — never construct a `PrismaClient` anywhere
 * else.
 *
 * Three things this handles:
 *
 * 1. Next.js hot-reloads modules in development, so a module-level client
 *    would open a new pool on every save until Postgres refuses connections.
 *    The instance is cached on `globalThis` to survive reloads.
 * 2. The client is created on first use rather than on import. `next build`
 *    evaluates route modules without a database, and a missing DATABASE_URL
 *    should fail the request that needs it, not the build.
 * 3. On Cloudflare Workers there is one client per request, not one per
 *    process. A Worker may not use a socket opened by a different request, so
 *    a shared pool hangs the second request that touches it. See
 *    `workerClient` below.
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

/** True inside the Workers runtime, false under Node (dev, build, scripts, tests). */
const ON_WORKERS =
  typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers';

/**
 * One client per request, keyed on the request's execution context — the one
 * object that is the same for a page render, the server actions and route
 * handlers it reaches, and any `after()` callback, and different for every
 * other request. A WeakMap lets the client go when the request does.
 */
const workerClients = new WeakMap<object, PrismaClient>();

function workerClient(): PrismaClient {
  const { env, ctx } = getCloudflareContext();

  const existing = workerClients.get(ctx);
  if (existing) return existing;

  // Hyperdrive is the pool, and it holds the TLS connection to Supabase, so
  // none of `pgPoolConfig` applies here. `maxUses: 1` stops `pg` keeping a
  // socket for a later request, which it would not be allowed to use.
  const hyperdrive = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
  if (!hyperdrive) {
    throw new Error('The HYPERDRIVE binding is missing. Check wrangler.jsonc.');
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: hyperdrive.connectionString, maxUses: 1 }),
    log: ['error'],
  });
  workerClients.set(ctx, client);
  return client;
}

function getClient(): PrismaClient {
  if (ON_WORKERS) return workerClient();

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
