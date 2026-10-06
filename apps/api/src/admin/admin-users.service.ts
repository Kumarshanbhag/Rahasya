import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Prisma, type RecoveryStatus, type UserStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { adminActor } from './admin-auth.service';
import type { UsersQuery } from './admin.dto';
import type { AdminContext, RequestMeta } from './admin.guard';

export const OPEN_RECOVERY: RecoveryStatus[] = ['PENDING', 'CONFIRMED'];
const DAY = 24 * 60 * 60 * 1000;

/** Managing user accounts from the admin console. Admins see account metadata only: never a vault, a key or a secret. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list({ filter = 'all', search }: UsersQuery) {
    const email = search ? { contains: search, mode: 'insensitive' as const } : undefined;
    const [users, invites, summary] = await Promise.all([
      this.prisma.user.findMany({
        where: { email },
        orderBy: { email: 'asc' },
        select: {
          id: true,
          email: true,
          status: true,
          totpEnabled: true,
          devices: { where: { revokedAt: null }, orderBy: { lastSeenAt: 'desc' }, take: 1, select: { lastSeenAt: true } },
          recoveryKeys: { where: { kind: 'RECOVERY' }, select: { kind: true } },
          recoveries: { where: { status: { in: OPEN_RECOVERY } }, select: { id: true } },
          _count: { select: { items: { where: { blob: { not: null }, deletedAt: null } } } },
        },
      }),
      this.prisma.userInvite.findMany({ where: { acceptedAt: null, email }, orderBy: { email: 'asc' } }),
      this.summary(),
    ]);
    // ponytail: filtered in memory, fine for organisations up to a few thousand users; page in SQL beyond that.
    const rows = [
      ...users.map((u) => ({
        id: u.id,
        email: u.email,
        status: u.status.toLowerCase(),
        twoFactor: u.totpEnabled as boolean | null,
        emergencyAccess: u.recoveries.length ? 'recovery_pending' : u.recoveryKeys.length ? 'opted_in' : 'not_set_up',
        lastActiveAt: u.devices[0]?.lastSeenAt ?? null,
        vaultItems: u._count.items,
      })),
      ...invites.map((i) => ({
        id: i.id,
        email: i.email,
        status: 'invited',
        twoFactor: null,
        emergencyAccess: 'not_set_up',
        lastActiveAt: null,
        vaultItems: 0,
      })),
    ];
    const keep: Record<typeof filter, (r: (typeof rows)[number]) => boolean> = {
      all: () => true,
      locked: (r) => r.status === 'locked',
      invited: (r) => r.status === 'invited',
      no2fa: (r) => r.twoFactor === false,
    };
    return { summary, users: rows.filter(keep[filter]) };
  }

  /** The four tiles: users, active today, two-step coverage, recovery requests. */
  private async summary() {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [users, twoStepOn, activeToday, invitedThisMonth, recoveryRequests] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { totpEnabled: true } }),
      this.prisma.user.count({ where: { devices: { some: { revokedAt: null, lastSeenAt: { gte: new Date(Date.now() - DAY) } } } } }),
      this.prisma.userInvite.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.recoveryRequest.count({ where: { status: { in: OPEN_RECOVERY } } }),
    ]);
    return { users, invitedThisMonth, activeToday, twoStep: { on: twoStepOn, missing: users - twoStepOn }, recoveryRequests };
  }

  /** Lock, suspend or re-enable an account. Every session checks the status on each request, so it applies at once. */
  setStatus(admin: AdminContext, meta: RequestMeta, userId: string, status: UserStatus, reason: string) {
    const action = { ACTIVE: 'user.activate', LOCKED: 'user.lock', SUSPENDED: 'user.suspend' }[status];
    return this.onUser(admin, meta, userId, action, reason, (tx) =>
      tx.user.update({ where: { id: userId }, data: { status, ...(status === 'ACTIVE' && { failedLogins: 0, lockedUntil: null }) } }),
    );
  }

  /** After an identity check: turns two-step sign-in off so the user can set it up again. */
  resetTwoFactor(admin: AdminContext, meta: RequestMeta, userId: string, reason: string) {
    return this.onUser(admin, meta, userId, 'user.reset_2fa', reason, (tx) =>
      tx.user.update({ where: { id: userId }, data: { totpEnabled: false, totpSecretEnc: null, totpLastStep: null } }),
    );
  }

  private onUser(admin: AdminContext, meta: RequestMeta, userId: string, action: string, reason: string, change: (tx: Prisma.TransactionClient) => Promise<unknown>) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
      if (!user) throw new NotFoundException('User not found');
      await change(tx);
      await this.audit.record({ actor: adminActor(admin), action, category: 'admin', target: { id: userId, label: user.email }, reason, ...meta, result: 'success' }, tx);
      // TODO: email the user about any admin action on their account once a mail provider is chosen.
    });
  }

  async invite(admin: AdminContext, meta: RequestMeta, email: string) {
    if (await this.prisma.user.count({ where: { email } })) throw new ConflictException('This person already has an account');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const invite = await tx.userInvite.create({ data: { email, invitedById: admin.id } });
        await this.audit.record({ actor: adminActor(admin), action: 'user.invite', category: 'admin', target: { id: invite.id, label: email }, ...meta, result: 'sent' }, tx);
        // TODO: send the invite email once a mail provider is chosen; until then the admin shares the sign-up link.
        return { id: invite.id, email };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('This email is already invited');
      throw e;
    }
  }
}
