import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';

/**
 * Every catalogue create/update/deactivate is logged — §12 Phase 1 requires an
 * `AuditLog` entry on every product and price change, and the same applies to
 * brands, categories and variants. `before`/`after` are the full row, not a
 * diff, so a manager can see exactly what a row looked like at any point.
 */
export async function recordAudit(entry: {
  userId: string;
  action: 'create' | 'update' | 'deactivate' | 'reactivate';
  entityType: string;
  entityId: string;
  before: object | null;
  after: object | null;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? Prisma.JsonNull,
      after: entry.after ?? Prisma.JsonNull,
    },
  });
}
