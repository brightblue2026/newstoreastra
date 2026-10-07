/*
  Prepares the two WebAssembly modules the app needs for Cloudflare Workers.

    node scripts/cf-prepare.mjs      (run by `pnpm build`, after `prisma generate`)

  Workers refuse to compile WebAssembly from bytes at runtime — the error is
  "Wasm code generation disallowed by embedder". A module has to be part of
  the deployed bundle instead. Two libraries here ship their module as a
  base64 string and compile it on first use, which is exactly what is refused:

    - Prisma's query compiler, so every database query failed.
    - yoga-layout, the layout engine under @react-pdf/renderer, so every GST
      invoice failed.

  This script writes both out as real .wasm files under `.cf/`. `worker.ts`
  imports them — a .wasm import in the Worker entry is compiled at deploy time
  — and puts the compiled modules on `globalThis.__bbWasm`. Each library is
  then pointed at that global:

    - Prisma: the generated client is patched below, because it is rewritten
      by every `prisma generate` and cannot carry the change itself.
    - yoga-layout: patches/yoga-layout@3.2.1.patch, applied by pnpm.

  Under Node the global is never set and both libraries behave as before, so
  local development, the seeds, the scripts and the tests are unaffected.
*/

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = process.cwd();
const outDir = path.join(root, '.cf');
mkdirSync(outDir, { recursive: true });

function writeWasm(name, base64) {
  const bytes = Buffer.from(base64, 'base64');
  // "\0asm" — anything else means the package changed shape under us.
  if (bytes.readUInt32LE(0) !== 0x6d736100) {
    throw new Error(`${name}: extracted bytes are not a WebAssembly module.`);
  }
  writeFileSync(path.join(outDir, name), bytes);
  console.log(`cf-prepare: wrote .cf/${name} (${Math.round(bytes.length / 1024)} KiB)`);
}

// ---------- Prisma query compiler ----------
const generatedClass = path.join(root, 'src/generated/prisma/internal/class.ts');
let source = readFileSync(generatedClass, 'utf8');

const importMatch = source.match(
  /import\("(@prisma\/client\/runtime\/query_compiler_[a-z_]+\.postgresql\.wasm-base64\.mjs)"\)/,
);
if (!importMatch) {
  throw new Error('cf-prepare: could not find the query compiler import in the generated client.');
}
const { wasm } = await import(require.resolve(importMatch[1]).replace(/^([A-Za-z]:)/, 'file:///$1'));
writeWasm('prisma-query-compiler.wasm', wasm);

const MARKER = '/* cf-prepare */';
if (!source.includes(MARKER)) {
  const anchor = 'getQueryCompilerWasmModule: async () => {\n';
  if (!source.includes(anchor)) {
    throw new Error('cf-prepare: the generated client no longer has the expected loader.');
  }
  source = source.replace(
    anchor,
    `${anchor}    ${MARKER}\n` +
      '    const precompiled = (globalThis as { __bbWasm?: { prisma?: WebAssembly.Module } }).__bbWasm?.prisma\n' +
      '    if (precompiled) return precompiled\n',
  );
  writeFileSync(generatedClass, source);
  console.log('cf-prepare: patched the generated Prisma client to accept a precompiled module');
}

// ---------- yoga-layout ----------
// Resolved from @react-pdf/layout, the package that actually depends on it.
const layoutRequire = createRequire(require.resolve('@react-pdf/renderer'));
const layoutEntry = layoutRequire.resolve('@react-pdf/layout');
const yogaLoad = createRequire(layoutEntry).resolve('yoga-layout/load');
const yogaBinary = path.join(path.dirname(yogaLoad), '../binaries/yoga-wasm-base64-esm.js');

const yogaMatch = readFileSync(yogaBinary, 'utf8').match(
  /data:application\/octet-stream;base64,([A-Za-z0-9+/=]+)/,
);
if (!yogaMatch) {
  throw new Error('cf-prepare: could not find the embedded module in yoga-layout.');
}
writeWasm('yoga.wasm', yogaMatch[1]);
