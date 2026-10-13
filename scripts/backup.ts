/** Encrypted application backup and isolated restore drill. Requires pg_dump/pg_restore, restic and (production) rclone. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Client } from 'pg';

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}
function localTest(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && /_test$/.test(url.pathname);
}
function pgEnv(value: string): NodeJS.ProcessEnv {
  const u = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) throw new Error('Expected PostgreSQL URL');
  if (!localTest(u) && u.searchParams.get('sslmode') !== 'verify-full') throw new Error('Remote backup requires sslmode=verify-full and a trusted PGSSLROOTCERT where needed');
  return { ...process.env, PGHOST: u.hostname.replace(/^\[|\]$/g, ''), PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.slice(1)), PGSSLMODE: localTest(u) ? 'disable' : 'verify-full' };
}
async function run(command: string, args: string[], env = process.env, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    // Never print raw tool stderr: it may include credentials or customer rows.
    child.stdout.on('data', (b: Buffer) => { out += b.toString(); });
    child.stderr.resume();
    child.on('error', () => reject(new Error(`${command} could not start`)));
    child.on('close', (code) => code === 0 ? resolve(out) : reject(new Error(`${command} failed (${code}); inspect privately on the trusted backup runner`)));
  });
}
async function hashes(root: string, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not accepted in backup input');
    if (entry.isDirectory()) Object.assign(result, await hashes(root, relative));
    else if (entry.isFile()) {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(path.join(root, relative))) hash.update(chunk);
      result[relative] = hash.digest('hex');
    }
  }
  return result;
}
async function main() {
  required('RESTIC_REPOSITORY');
  if (!process.env.RESTIC_PASSWORD && !process.env.RESTIC_PASSWORD_FILE) throw new Error('Set RESTIC_PASSWORD_FILE or RESTIC_PASSWORD from a secret store');
  const mode = process.argv[2];
  const temp = await mkdtemp(path.join(tmpdir(), 'bb-backup-'));
  try {
    if (mode === 'create') {
      const source = required('BACKUP_DATABASE_URL');
      const env = pgEnv(source);
      await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', '--schema=public', '--file', path.join(temp, 'database.dump')], env);
      await mkdir(path.join(temp, 'storage'));
      if (process.env.BACKUP_STORAGE_DIR) {
        if (!localTest(new URL(source))) throw new Error('Local fixture storage is only allowed with a local _test database');
        await cp(process.env.BACKUP_STORAGE_DIR, path.join(temp, 'storage'), { recursive: true, dereference: false });
      } else {
        required('RCLONE_S3_ACCESS_KEY_ID'); required('RCLONE_S3_SECRET_ACCESS_KEY'); required('RCLONE_S3_ENDPOINT');
        const remote = ':s3:product-images';
        const rcloneEnv = { ...process.env, RCLONE_S3_PROVIDER: 'Other', RCLONE_S3_ENV_AUTH: 'true' };
        const metadata = await run('rclone', ['lsjson', remote, '--recursive', '--files-only', '--metadata'], rcloneEnv);
        await writeFile(path.join(temp, 'storage-metadata.json'), metadata, { mode: 0o600 });
        await run('rclone', ['copy', remote, path.join(temp, 'storage'), '--checkers=4', '--transfers=4'], rcloneEnv);
        await run('rclone', ['check', remote, path.join(temp, 'storage'), '--download', '--one-way'], rcloneEnv);
      }
      const files = await hashes(temp);
      await writeFile(path.join(temp, 'manifest.json'), JSON.stringify({ version: 1, createdAt: new Date().toISOString(), scope: 'public application schema and product-images objects; not a full Supabase platform clone', files }), { mode: 0o600 });
      const result = await run('restic', ['backup', temp, '--tag', 'brightblue', '--json']);
      const summary = result.trim().split('\n').map((line) => JSON.parse(line) as { message_type?: string; snapshot_id?: string }).find((line) => line.message_type === 'summary');
      if (!summary?.snapshot_id) throw new Error('Backup did not return a snapshot id');
      console.log(JSON.stringify({ snapshotId: summary.snapshot_id, files: Object.keys(files).length }));
    } else if (mode === 'restore-drill') {
      const target = required('RESTORE_DATABASE_URL');
      if (!localTest(new URL(target))) throw new Error('Restore drills require a LOCAL database ending in _test');
      const snapshot = required('BACKUP_SNAPSHOT_ID');
      if (!/^[a-f0-9]{8,64}$/.test(snapshot)) throw new Error('Use an exact snapshot ID');
      const snapshots = JSON.parse(await run('restic', ['snapshots', snapshot, '--json'])) as { paths: string[] }[];
      if (snapshots.length !== 1 || snapshots[0].paths.length !== 1) throw new Error('Expected one application snapshot root');
      await run('restic', ['restore', snapshot, '--target', temp]);
      const root = path.resolve(temp, '.' + snapshots[0].paths[0]);
      if (!root.startsWith(temp + path.sep)) throw new Error('Invalid snapshot root');
      const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')) as { files: Record<string, string> };
      const actual = await hashes(root); delete actual['manifest.json'];
      if (JSON.stringify(Object.entries(actual).sort()) !== JSON.stringify(Object.entries(manifest.files).sort())) throw new Error('Backup file integrity check failed');
      const client = new Client({ connectionString: target }); await client.connect();
      try {
        const count = await client.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
        if (count.rows[0].n !== 0) throw new Error('Restore target must be empty; existing data will never be dropped');
        await run('pg_restore', ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--dbname', decodeURIComponent(new URL(target).pathname.slice(1)), path.join(root, 'database.dump')], pgEnv(target));
        const result = await client.query('SELECT count(*)::int AS products FROM "Product"');
        console.log(JSON.stringify({ restored: true, productRows: result.rows[0].products, verifiedFiles: Object.keys(actual).length }));
      } finally { await client.end(); }
    } else throw new Error('Use create or restore-drill');
  } finally { await rm(temp, { recursive: true, force: true }); }
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Backup operation failed'); process.exitCode = 1; });
