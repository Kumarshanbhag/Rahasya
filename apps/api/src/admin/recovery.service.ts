import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RECOVERY_WAIT_H } from '@rahasya/config';
import { AuditService } from '../audit/audit.service';
import { hashAuthKey } from '../auth/auth.service';
import type { NewCredentialsDto } from '../auth/auth.dto';
import { b64, bytes } from '../common/bytes';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { adminActor } from './admin-auth.service';
import { OPEN_RECOVERY } from './admin-users.service';
import type { AdminContext, RequestMeta } from './admin.guard';
import { WebAuthnService } from './webauthn.service';

const HOUR = 60 * 60 * 1000;

/** Hours between an admin confirming a recovery and it becoming usable. TODO: make it an organisation setting (0 to 7 days) instead of an env var. */
function waitHours() {
  const hours = Number(process.env.RECOVERY_WAIT_HOURS ?? RECOVERY_WAIT_H.default);
  if (!Number.isInteger(hours) || hours < RECOVERY_WAIT_H.min || hours > RECOVERY_WAIT_H.max) {
    throw new Error(`RECOVERY_WAIT_HOURS must be a whole number from ${RECOVERY_WAIT_H.min} to ${RECOVERY_WAIT_H.max}`);
  }
  return hours;
}

const withPeople = { user: { select: { id: true, email: true } }, requestedBy: { select: { id: true, name: true } }, confirmedBy: { select: { id: true, name: true } } } as const;
type RequestWithPeople = Prisma.RecoveryRequestGetPayload<{ include: typeof withPeople }>;

const toRequest = (r: RequestWithPeople) => ({
  id: r.id,
  user: r.user,
  requestedBy: r.requestedBy,
  reason: r.reason,
  status: r.status.toLowerCase(),
  createdAt: r.createdAt,
  confirmedBy: r.confirmedBy,
  confirmedAt: r.confirmedAt,
  availableAt: r.availableAt,
  cancelledAt: r.cancelledAt,
  cancelledBy: r.cancelledBy,
  usedAt: r.usedAt,
});

/**
 * Emergency account recovery for a user who has lost their master password. The user opts in, an admin requests with a reason and confirms with a security key,
 * the user can cancel during the waiting period, and only the organisation's offline key can open the sealed vault key.
 * The server never can.
 */
@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webauthn: WebAuthnService,
  ) {}

  // ---- the user's side (vault app) ----

  publicKey() {
    const publicKey = process.env.RECOVERY_PUBLIC_KEY;
    if (!publicKey) throw new NotFoundException('Your organisation has not set up recovery');
    return { publicKey };
  }

  async optIn(userId: string, sealedKey: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    await this.prisma.$transaction(async (tx) => {
      const data = { sealedKey: bytes(sealedKey) };
      await tx.recoveryKey.upsert({ where: { userId_kind: { userId, kind: 'RECOVERY' } }, create: { userId, kind: 'RECOVERY', ...data }, update: data });
      await this.audit.record({ actor: { type: 'user', id: userId, label: user.email }, action: 'recovery.opt_in', category: 'emergency', target: { id: userId, label: user.email }, result: 'success' }, tx);
    });
  }

  /** Turning it off deletes the sealed copy, and with it any request that would have used it. */
  async optOut(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.recoveryKey.deleteMany({ where: { userId, kind: 'RECOVERY' } });
      await tx.recoveryRequest.updateMany({ where: { userId, status: { in: OPEN_RECOVERY } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: 'user' } });
      await this.audit.record({ actor: { type: 'user', id: userId, label: user.email }, action: 'recovery.opt_out', category: 'emergency', target: { id: userId, label: user.email }, result: 'success' }, tx);
    });
  }

  /** Open requests on the user's account, so every device can show them with a Cancel button. */
  async mine(userId: string) {
    const requests = await this.prisma.recoveryRequest.findMany({ where: { userId, status: { in: OPEN_RECOVERY } }, orderBy: { createdAt: 'desc' } });
    return requests.map((r) => ({ id: r.id, status: r.status.toLowerCase(), reason: r.reason, createdAt: r.createdAt, availableAt: r.availableAt }));
  }

  cancelByUser(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.recoveryRequest.findFirst({ where: { id, userId }, include: { user: { select: { email: true } } } });
      if (!request) throw new NotFoundException('Request not found');
      await this.cancel(tx, request.id, 'user');
      await this.audit.record({ actor: { type: 'user', id: userId, label: request.user.email }, action: 'recovery.cancel', category: 'emergency', target: { id: userId, label: request.user.email }, result: 'cancelled' }, tx);
      return { id, status: 'cancelled' };
    });
  }

  private async cancel(tx: Prisma.TransactionClient, id: string, by: string) {
    const { count } = await tx.recoveryRequest.updateMany({ where: { id, status: { in: OPEN_RECOVERY } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: by } });
    if (!count) throw new ConflictException('This request is no longer open');
  }

  // ---- the admin's side ----

  async list(status: 'open' | 'all' = 'open') {
    const requests = await this.prisma.recoveryRequest.findMany({
      where: status === 'open' ? { status: { in: OPEN_RECOVERY } } : {},
      include: withPeople,
      orderBy: { createdAt: 'desc' },
    });
    return requests.map(toRequest);
  }

  async detail(id: string) {
    const request = await this.prisma.recoveryRequest.findUnique({ where: { id }, include: withPeople });
    if (!request) throw new NotFoundException('Request not found');
    return { ...toRequest(request), waitHours: waitHours() };
  }

  async start(admin: AdminContext, meta: RequestMeta, userId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, include: { recoveryKeys: { where: { kind: 'RECOVERY' } } } });
      if (!user) throw new NotFoundException('User not found');
      if (!user.recoveryKeys.length) throw new BadRequestException("This user hasn't opted in to emergency recovery");
      if (await tx.recoveryRequest.count({ where: { userId, status: { in: OPEN_RECOVERY } } })) throw new ConflictException('A request is already open for this user');
      const request = await tx.recoveryRequest.create({ data: { userId, requestedById: admin.id, reason }, include: withPeople });
      await this.audit.record({ actor: adminActor(admin), action: 'recovery.request', category: 'emergency', target: { id: userId, label: user.email }, reason, ...meta, result: 'requested' }, tx);
      // TODO: notify the user at once by email and on every device, once notifications exist.
      return toRequest(request);
    });
  }

  /** One admin confirms with their own security key; that starts the waiting period. */
  async confirm(admin: AdminContext, meta: RequestMeta, id: string, challengeId: string, response: Parameters<WebAuthnService['verifyAssertion']>[2]) {
    await this.webauthn.verifyAssertion(challengeId, 'step-up', response, admin.id);
    return this.prisma.$transaction(async (tx) => {
      const hours = waitHours();
      const now = new Date();
      const { count } = await tx.recoveryRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: 'CONFIRMED', confirmedById: admin.id, confirmedAt: now, availableAt: new Date(now.getTime() + hours * HOUR) },
      });
      if (!count) throw new ConflictException('Only a pending request can be confirmed');
      const request = await tx.recoveryRequest.findUniqueOrThrow({ where: { id }, include: withPeople });
      const target = { id: request.user.id, label: request.user.email };
      await this.audit.record({ actor: adminActor(admin), action: 'recovery.confirm', category: 'emergency', target, ...meta, result: 'confirmed' }, tx);
      await this.audit.record({ actor: { type: 'system', label: 'System' }, action: 'recovery.wait_started', category: 'emergency', target, reason: `${hours} h`, result: 'running' }, tx);
      // TODO: notify the user by email and on every device; they can cancel until the wait ends.
      return toRequest(request);
    });
  }

  /** An admin withdraws a request, for example one filed for the wrong person. */
  cancelByAdmin(admin: AdminContext, meta: RequestMeta, id: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.recoveryRequest.findUnique({ where: { id }, include: { user: { select: { id: true, email: true } } } });
      if (!request) throw new NotFoundException('Request not found');
      await this.cancel(tx, id, admin.id);
      await this.audit.record({ actor: adminActor(admin), action: 'recovery.cancel', category: 'emergency', target: { id: request.user.id, label: request.user.email }, reason, ...meta, result: 'cancelled' }, tx);
      return { id, status: 'cancelled' };
    });
  }

  private async ready(id: string) {
    const request = await this.prisma.recoveryRequest.findUnique({ where: { id }, include: { user: { select: { id: true, email: true } } } });
    if (!request) throw new NotFoundException('Request not found');
    if (request.status !== 'CONFIRMED') throw new ConflictException('This request is not confirmed');
    if (request.availableAt! > new Date()) throw new ConflictException(`Recovery is available after ${request.availableAt!.toISOString()}`);
    return request;
  }

  /**
   * After the wait, the admin console fetches the vault key sealed to the organisation's offline key and opens it
   * on the admin's own computer; the server can't.
   */
  async package(admin: AdminContext, meta: RequestMeta, id: string) {
    const request = await this.ready(id);
    const key = await this.prisma.recoveryKey.findUnique({ where: { userId_kind: { userId: request.userId, kind: 'RECOVERY' } } });
    if (!key) throw new ConflictException('The user turned recovery off');
    // Logged before it is handed out, so an access can never go unrecorded.
    await this.audit.record({ actor: adminActor(admin), action: 'recovery.package', category: 'emergency', target: { id: request.user.id, label: request.user.email }, ...meta, result: 'released' });
    return { requestId: id, user: request.user, sealedKey: b64(key.sealedKey) };
  }

  /**
   * The last recovery step. With the vault key opened on the admin's computer, the user types a new master password there; the console derives the new authKey and wrapped key in the browser and
   * sends only those. The old password stops working and every session is signed out.
   */
  async complete(admin: AdminContext, meta: RequestMeta, id: string, dto: NewCredentialsDto) {
    const request = await this.ready(id);
    const authHash = await hashAuthKey(dto.authKey);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.recoveryRequest.updateMany({ where: { id, status: 'CONFIRMED' }, data: { status: 'USED', usedAt: new Date() } });
      if (!count) throw new ConflictException('This request is no longer open');
      await tx.user.update({
        where: { id: request.userId },
        data: { authHash, kdfSalt: bytes(dto.kdfSalt), kdfParams: { ...dto.kdfParams }, wrappedVaultKey: bytes(dto.wrappedVaultKey), failedLogins: 0, lockedUntil: null },
      });
      const now = new Date();
      await tx.device.updateMany({ where: { userId: request.userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.refreshToken.updateMany({ where: { userId: request.userId, revokedAt: null }, data: { revokedAt: now } });
      await this.audit.record({ actor: adminActor(admin), action: 'recovery.complete', category: 'emergency', target: { id: request.user.id, label: request.user.email }, ...meta, result: 'recovered' }, tx);
    });
  }
}
