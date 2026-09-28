import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
  Every table must have row-level security on, or Supabase's REST API serves
  it to anyone holding the public anon key. Prisma never adds RLS itself, so a
  new model shipped without a matching `ENABLE ROW LEVEL SECURITY` would
  silently reopen the hole closed in 20260928070000_lock_down_data_api.
*/

const root = process.cwd();
const schema = readFileSync(path.join(root, 'prisma', 'schema.prisma'), 'utf8');
const migrationsDir = path.join(root, 'prisma', 'migrations');
const allMigrations = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => readFileSync(path.join(migrationsDir, entry.name, 'migration.sql'), 'utf8'))
  .join('\n');

const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]);

describe('row-level security', () => {
  it('finds the models', () => {
    expect(models.length).toBeGreaterThan(10);
    expect(schema).not.toMatch(/@@map\(/); // table name = model name, as assumed below
  });

  it.each([...models, '_prisma_migrations'])('is enabled on "%s"', (table) => {
    expect(allMigrations).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
  });
});
