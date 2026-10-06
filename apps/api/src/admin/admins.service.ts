import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ADMIN_INVITE_TTL_MS } from '@rahasya/config';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { env } from '../env';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { adminActor, sha256 } from './admin-auth.service';
import type { HandoverDto, InviteAdminDto, RoleDto, UpdateAdminDto, UpdateRoleDto } from './admin.dto';
import type { AdminContext, RequestMeta } from './admin.guard';
import { WebAuthnService } from './webauthn.service';

const SUPER_IS_PROTECTED = 'The super admin can never be changed, suspended or removed';
const SYSTEM = { type: 'system' as const, label: 'System' };

function newInvite() {
  const token = randomBytes(32).toString('base64url');
  return { token, inviteHash: sha256(token), inviteExpiresAt: new Date(Date.now() + ADMIN_INVITE_TTL_MS) };
}
const inviteUrl = (token: string) => `${env('ADMIN_ORIGIN')}/invite?token=${token}`;
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

/** Admin accounts and roles, plus the server commands that create and rescue the super admin. */
@Injectable()
export class AdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webauthn: WebAuthnService,
  ) {}

  async list(me: AdminContext) {
    const admins = await this.prisma.admin.findMany({ include: { role: true, _count: { select: { keys: true } } }, orderBy: { createdAt: 'asc' } });
    return admins.map((a) => ({
      id: a.id,
      email: a.email,
      name: a.name,
      role: { id: a.role.id, name: a.role.name },
      isSuper: a.isSuper,
      status: a.status.toLowerCase(),
      keyStatus: a._count.keys ? 'registered' : 'pending',
      lastLoginAt: a.lastLoginAt,
      you: a.id === me.id,
    }));
  }

  /** New admins are invited by email and register a hardware security key when they accept. */
  async invite(me: AdminContext, meta: RequestMeta, dto: InviteAdminDto) {
    if (!(await this.prisma.adminRole.count({ where: { id: dto.roleId } }))) throw new BadRequestException('Role not found');
    const { token, ...invite } = newInvite();
    try {
      const admin = await this.prisma.$transaction(async (tx) => {
        const created = await tx.admin.create({ data: { email: dto.email, name: dto.name, roleId: dto.roleId, invitedById: me.id, ...invite } });
        await this.audit.record({ actor: adminActor(me), action: 'admin.invite', category: 'admin', target: { id: created.id, label: dto.email }, ...meta, result: 'sent' }, tx);
        return created;
      });
      // TODO: email the link and notify all Owners once a mail provider is chosen; until then the console shows it.
      return { id: admin.id, inviteUrl: inviteUrl(token) };
    } catch (e) {
      if (isUnique(e)) throw new ConflictException('An admin with this email already exists');
      throw e;
    }
  }

  /** Refused, and logged as refused, when the target is the super admin. */
  private async notSuper(me: AdminContext, meta: RequestMeta, id: string, action: string, reason?: string) {
    const target = await this.prisma.admin.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Admin not found');
    if (target.isSuper) {
      await this.audit.record({ actor: adminActor(me), action, category: 'admin', target: { id, label: target.email }, reason, ...meta, result: 'denied' });
      throw new ForbiddenException(SUPER_IS_PROTECTED);
    }
    return target;
  }

  async update(me: AdminContext, meta: RequestMeta, id: string, dto: UpdateAdminDto) {
    const target = await this.notSuper(me, meta, id, 'admin.update', dto.reason);
    if (dto.status && target.status !== 'ACTIVE' && target.status !== 'SUSPENDED') throw new BadRequestException('This admin has not accepted the invite yet');
    if (dto.roleId && !(await this.prisma.adminRole.count({ where: { id: dto.roleId } }))) throw new BadRequestException('Role not found');
    await this.prisma.$transaction(async (tx) => {
      // isSuper in the filter closes the gap if a handover lands in between.
      const { count } = await tx.admin.updateMany({ where: { id, isSuper: false }, data: { roleId: dto.roleId, status: dto.status } });
      if (!count) throw new ForbiddenException(SUPER_IS_PROTECTED);
      await this.audit.record({ actor: adminActor(me), action: 'admin.update', category: 'admin', target: { id, label: target.email }, reason: dto.reason, ...meta, result: 'success' }, tx);
      // TODO: notify all Owners of every change to admins.
    });
  }

  async remove(me: AdminContext, meta: RequestMeta, id: string, reason: string) {
    const target = await this.notSuper(me, meta, id, 'admin.remove', reason);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.admin.deleteMany({ where: { id, isSuper: false } });
      if (!count) throw new ForbiddenException(SUPER_IS_PROTECTED);
      await this.audit.record({ actor: adminActor(me), action: 'admin.remove', category: 'admin', target: { id, label: target.email }, reason, ...meta, result: 'success' }, tx);
      // TODO: notify all Owners.
    });
  }

  async roles() {
    const roles = await this.prisma.adminRole.findMany({ include: { _count: { select: { admins: true } } }, orderBy: [{ builtIn: 'desc' }, { name: 'asc' }] });
    return roles.map((r) => ({ id: r.id, name: r.name, permissions: r.permissions, builtIn: r.builtIn, admins: r._count.admins }));
  }

  async createRole(me: AdminContext, meta: RequestMeta, dto: RoleDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.adminRole.create({ data: { name: dto.name, permissions: dto.permissions, createdById: me.id } });
        await this.audit.record({ actor: adminActor(me), action: 'role.create', category: 'admin', target: { id: role.id, label: role.name }, reason: dto.permissions.join(', '), ...meta, result: 'success' }, tx);
        return { id: role.id, name: role.name, permissions: role.permissions, builtIn: false };
      });
    } catch (e) {
      if (isUnique(e)) throw new ConflictException('A role with this name already exists');
      throw e;
    }
  }

  async updateRole(me: AdminContext, meta: RequestMeta, id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.adminRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.builtIn) throw new ForbiddenException("Built-in roles can't be changed");
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.adminRole.update({ where: { id }, data: { name: dto.name, permissions: dto.permissions } });
        await this.audit.record({ actor: adminActor(me), action: 'role.update', category: 'admin', target: { id, label: dto.name ?? role.name }, reason: dto.permissions?.join(', '), ...meta, result: 'success' }, tx);
      });
    } catch (e) {
      if (isUnique(e)) throw new ConflictException('A role with this name already exists');
      throw e;
    }
  }

  /** Only the super admin can hand the role on, confirmed with their own security key; they become an Owner. */
  async handover(me: AdminContext, meta: RequestMeta, dto: HandoverDto) {
    if (!me.isSuper) {
      await this.audit.record({ actor: adminActor(me), action: 'admin.super_handover', category: 'admin', target: { id: dto.adminId }, ...meta, result: 'denied' });
      throw new ForbiddenException('Only the super admin can hand over the role');
    }
    await this.webauthn.verifyAssertion(dto.challengeId, 'step-up', dto.response, me.id);
    const target = await this.prisma.admin.findUnique({ where: { id: dto.adminId } });
    if (!target || target.id === me.id || target.status !== 'ACTIVE') throw new BadRequestException('Choose another active admin');
    const owner = await this.prisma.adminRole.findUniqueOrThrow({ where: { name: 'Owner' } });
    await this.prisma.$transaction(async (tx) => {
      // In this order: the database allows only one super admin at any moment.
      await tx.admin.update({ where: { id: me.id }, data: { isSuper: false, roleId: owner.id } });
      await tx.admin.update({ where: { id: target.id }, data: { isSuper: true } });
      await this.audit.record({ actor: adminActor(me), action: 'admin.super_handover', category: 'admin', target: { id: target.id, label: target.email }, ...meta, result: 'success' }, tx);
      // TODO: notify all Owners.
    });
  }

  // ---- server commands (src/cli.ts) ----

  /** Setup: the one super admin, holding the Owner role plus the protected flag. Returns their invite link. */
  async createSuperAdmin(email: string, name: string) {
    if (await this.prisma.admin.count({ where: { isSuper: true } })) throw new Error('A super admin already exists. If its key is lost, use break-glass.');
    const owner = await this.prisma.adminRole.findUniqueOrThrow({ where: { name: 'Owner' } });
    const { token, ...invite } = newInvite();
    const address = email.trim().toLowerCase();
    await this.prisma.$transaction(async (tx) => {
      const admin = await tx.admin.create({ data: { email: address, name, roleId: owner.id, isSuper: true, ...invite } });
      await this.audit.record({ actor: SYSTEM, action: 'admin.super_created', category: 'admin', target: { id: admin.id, label: address }, device: 'Server command', result: 'success' }, tx);
    });
    return { email: address, inviteUrl: inviteUrl(token) };
  }

  /**
   * Break-glass for a lost or stolen super admin key: reset the keys (with a new invite to register one) or freeze
   * the account. Never deletes it.
   * TODO: also require proof of the organisation's offline key; for now shell access to the API host is the only gate.
   */
  async breakGlass(email: string, action: 'reset-keys' | 'freeze' | 'unfreeze') {
    const admin = await this.prisma.admin.findUnique({ where: { email: email.trim().toLowerCase() }, include: { _count: { select: { keys: true } } } });
    if (!admin?.isSuper) throw new Error('No super admin with that email');
    const { token, ...invite } = newInvite();
    await this.prisma.$transaction(async (tx) => {
      if (action === 'reset-keys') {
        await tx.adminKey.deleteMany({ where: { adminId: admin.id } });
        await tx.admin.update({ where: { id: admin.id }, data: { status: 'INVITED', ...invite } });
      } else {
        const ready = admin._count.keys > 0 && !!admin.passwordHash;
        await tx.admin.update({ where: { id: admin.id }, data: { status: action === 'freeze' ? 'FROZEN' : ready ? 'ACTIVE' : 'INVITED' } });
      }
      await this.audit.record({ actor: SYSTEM, action: 'admin.break_glass', category: 'admin', target: { id: admin.id, label: admin.email }, device: 'Server command', result: action }, tx);
      // TODO: notify all Owners.
    });
    return action === 'reset-keys' ? { email: admin.email, inviteUrl: inviteUrl(token) } : { email: admin.email, status: action === 'freeze' ? 'frozen' : 'unfrozen' };
  }
}
