/*
  Runs the Cloudflare Worker build, at most once per Cloudflare Git build.

    node scripts/cf-build.mjs                 (`pnpm build`)
    node scripts/cf-build.mjs --postinstall   (`postinstall`)

  Cloudflare's Git build runs three steps: install, the dashboard's build
  command, then the deploy command. The deploy fails with "Could not find
  compiled Open Next config" unless `.open-next/` exists by then, and whether
  it does depends on a build command typed into the dashboard, which the
  repository cannot see or set.

  So on Cloudflare's builder — it sets WORKERS_CI — the build also runs at the
  end of install. Whatever the dashboard's build command is, including nothing
  at all, the deploy step finds a build. If that command is `pnpm build` as
  well, the second run finds the output already there and does nothing.

  Anywhere else `--postinstall` is a no-op, so `pnpm install` on a laptop or
  in GitHub Actions is exactly as fast as before.
*/

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const onCloudflareBuilder = Boolean(process.env.WORKERS_CI);
const fromPostinstall = process.argv.includes('--postinstall');

if (fromPostinstall && !onCloudflareBuilder) process.exit(0);

if (onCloudflareBuilder && existsSync('.open-next/worker.js')) {
  console.log('cf-build: .open-next already built in this run, skipping.');
  process.exit(0);
}

const result = spawnSync('pnpm', ['exec', 'opennextjs-cloudflare', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
