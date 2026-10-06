import { Global, Injectable, Module } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuditActor, AuditCategory, AuditLog, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';

export type AuditEntry = {
  actor: { type: AuditActor; id?: string | null; label: string };
  action: string;
  category: AuditCategory;
  target?: { id?: string | null; label?: string | null };
  reason?: string | null;
  device?: string | null;
  ip?: string | null;
  result: string;
};

type Db = Prisma.TransactionClient;
type Hashed = Omit<AuditLog, 'id' | 'prevHash' | 'hash'>;

export type AuditFilter = { category?: AuditCategory; search?: string; before?: string };

const GENESIS = '0'.repeat(64);

const toEntry = (r: AuditLog) => ({
  id: r.id.toString(),
  at: r.at,
  actor: { type: r.actorType, id: r.actorId, label: r.actorLabel },
  action: r.action,
  category: r.category,
  target: { id: r.targetId, label: r.targetLabel },
  reason: r.reason,
  device: r.device,
  ip: r.ip,
  result: r.result,
});

/** Quoted, and defused against spreadsheet formula injection. */
function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${(/^[=+\-@\t\r]/.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`;
}

function digest(prevHash: string, r: Hashed) {
  const fields = [r.at.toISOString(), r.actorType, r.actorId, r.actorLabel, r.action, r.category, r.targetId, r.targetLabel, r.reason, r.device, r.ip, r.result];
  return createHash('sha256').update(prevHash).update(JSON.stringify(fields)).digest('hex');
}

/** The append-only, hash-chained audit log of sign-ins and admin actions. Each entry's hash covers the previous one, so any edit breaks the chain. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends one entry. Pass `tx` to commit it together with the change it records. Without `tx` it commits
   * on its own, which is how an action with effects outside the database is logged before it runs.
   */
  record(entry: AuditEntry, tx?: Db) {
    return tx ? this.append(tx, entry) : this.prisma.$transaction((t) => this.append(t, entry));
  }

  private async append(db: Db, entry: AuditEntry) {
    // ponytail: one global lock orders the chain; fine at admin-console volume.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('audit_log'))`;
    const last = await db.auditLog.findFirst({ orderBy: { id: 'desc' }, select: { hash: true } });
    const row: Hashed = {
      at: new Date(),
      actorType: entry.actor.type,
      actorId: entry.actor.id ?? null,
      actorLabel: entry.actor.label,
      action: entry.action,
      category: entry.category,
      targetId: entry.target?.id ?? null,
      targetLabel: entry.target?.label ?? null,
      reason: entry.reason ?? null,
      device: entry.device?.slice(0, 200) ?? null,
      ip: entry.ip ?? null,
      result: entry.result,
    };
    const prevHash = last?.hash ?? GENESIS;
    await db.auditLog.create({ data: { ...row, prevHash, hash: digest(prevHash, row) } });
  }

  private where(q: AuditFilter): Prisma.AuditLogWhereInput {
    const like = q.search ? { contains: q.search, mode: 'insensitive' as const } : undefined;
    return {
      category: q.category,
      ...(q.before && { id: { lt: BigInt(q.before) } }),
      ...(like && { OR: [{ actorLabel: like }, { targetLabel: like }, { action: like }] }),
    };
  }

  /** Entries newest first, 100 at a time; pass the returned `nextBefore` for the next page. */
  async list(q: AuditFilter, take = 100) {
    const rows = await this.prisma.auditLog.findMany({ where: this.where(q), orderBy: { id: 'desc' }, take });
    return { entries: rows.map(toEntry), nextBefore: rows.length === take ? rows.at(-1)!.id.toString() : null };
  }

  /** CSV with each entry's hash, so the chain can be checked outside the console too. */
  async csv(q: AuditFilter) {
    // ponytail: builds the whole file in memory; stream it once logs reach hundreds of thousands of rows.
    const rows = await this.prisma.auditLog.findMany({ where: this.where({ ...q, before: undefined }), orderBy: { id: 'asc' } });
    const header = ['id', 'time', 'category', 'who', 'action', 'target', 'reason', 'device', 'ip', 'result', 'prev_hash', 'hash'];
    const lines = rows.map((r) => [r.id, r.at.toISOString(), r.category, r.actorLabel, r.action, r.targetLabel, r.reason, r.device, r.ip, r.result, r.prevHash, r.hash]);
    return [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n');
  }

  /** "Log chain verified": recomputes every hash from the first entry. */
  async verify(db: Db = this.prisma) {
    let prevHash = GENESIS;
    let checked = 0;
    let after: bigint | undefined;
    for (;;) {
      const rows = await db.auditLog.findMany({ where: after === undefined ? {} : { id: { gt: after } }, orderBy: { id: 'asc' }, take: 1000 });
      for (const r of rows) {
        if (r.prevHash !== prevHash || r.hash !== digest(prevHash, r)) return { verified: false, checked, brokenAt: r.id.toString() };
        prevHash = r.hash;
        checked++;
      }
      if (rows.length < 1000) return { verified: true, checked };
      after = rows[rows.length - 1]!.id;
    }
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
