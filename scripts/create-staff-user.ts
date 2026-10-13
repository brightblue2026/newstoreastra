/*
  Create or update a staff login.

    pnpm user:create --email you@example.com --name "Your Name" [--role ADMIN]

  The admin panel has no user-management screen, so the first real account has
  to be made from outside it — you cannot sign in to create the account you
  need in order to sign in. This is that bootstrap.

  The password is never taken as a command-line argument: arguments are visible
  in shell history and to anything that can list processes. It is either typed
  at a hidden prompt, or passed in `STAFF_PASSWORD` for a non-interactive run.

  Re-running against an existing address updates that account — new password,
  role and name, and reactivated if it had been switched off. That makes this
  the password-reset path too, for as long as there is no screen for it.
*/

import path from 'node:path';
import readline from 'node:readline';
import { PrismaPg } from '@prisma/adapter-pg';
import { pgPoolConfig } from '../src/lib/pg-config';
import { PrismaClient, Prisma, UserRole } from '../src/generated/prisma/client';
import { hashPassword } from '../src/lib/password';

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // No .env present, or already loaded.
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env first.');
}

const prisma = new PrismaClient({ adapter: new PrismaPg(pgPoolConfig(connectionString)) });

/** Long enough to be worth having; everything shorter is a false sense of security. */
const MIN_PASSWORD_LENGTH = 12;

/** The seeded dev password. Fine on a laptop, never on anything reachable. */
const DEV_PASSWORD = 'ChangeMe!Dev1';

const STAFF_ROLES = [UserRole.STAFF, UserRole.MANAGER, UserRole.ADMIN] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args.set(key, 'true');
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

/** Reads a line without echoing it, so the password never reaches the scrollback. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    let muted = false;
    // `readline` writes each keystroke back to the terminal. Replacing its
    // writer is the documented-enough way to stop that for one question.
    (rl as unknown as { _writeToOutput: (chunk: string) => void })._writeToOutput = (chunk) => {
      if (!muted) process.stdout.write(chunk);
    };

    rl.question(question, (answer) => {
      muted = false;
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });

    muted = true;
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.STAFF_PASSWORD;
  if (fromEnv) return fromEnv;

  if (!process.stdin.isTTY) {
    throw new Error(
      'No terminal to prompt on. Set STAFF_PASSWORD in the environment for a non-interactive run.',
    );
  }

  const first = await promptHidden('New password (not shown): ');
  const second = await promptHidden('Confirm password: ');
  if (first !== second) throw new Error('The two passwords did not match.');
  return first;
}

function assertUsablePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (password === DEV_PASSWORD) {
    throw new Error('That is the seeded dev password. Choose a different one.');
  }
}

function parseRole(raw: string | undefined): StaffRole {
  if (raw === undefined) return UserRole.ADMIN;
  const upper = raw.toUpperCase();
  const match = STAFF_ROLES.find((role) => role === upper);
  if (!match) {
    throw new Error(`--role must be one of ${STAFF_ROLES.join(', ')}. Got "${raw}".`);
  }
  return match;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const email = args.get('email')?.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Pass a valid address: --email you@example.com');
  }

  const role = parseRole(args.get('role'));
  const name = args.get('name')?.trim() || null;

  const password = await readPassword();
  assertUsablePassword(password);
  const passwordHash = await hashPassword(password);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, role, passwordHash, isActive: true },
    // A reset also lifts a sign-in pause and ends every existing session.
    update: {
      name: name ?? existing?.name ?? null,
      role,
      passwordHash,
      isActive: true,
      failedLoginCount: 0,
      lockedUntil: null,
      sessionVersion: { increment: 1 },
    },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  // Same shape as `recordAudit`, which cannot be imported here because it is
  // `server-only`. The actor is the account itself: a bootstrap has no other.
  // `before`/`after` are the row without the hash — an audit trail should never
  // become somewhere a credential is stored twice.
  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: existing ? 'update' : 'create',
      entityType: 'User',
      entityId: user.id,
      before: existing ?? Prisma.JsonNull,
      after: user,
    },
  });

  const verb = existing ? 'Updated' : 'Created';
  console.log(`${verb} ${user.email} as ${user.role}.`);
  if (existing && existing.role !== user.role) {
    console.log(`Role changed from ${existing.role} to ${user.role}.`);
  }
  if (existing && !existing.isActive) {
    console.log('Account was inactive and has been reactivated.');
  }
  console.log('Sign in at /admin/login.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
