import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { ADMIN_SESSION_MS } from '@rahasya/config';
import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma.service';
import type { AcceptInviteDto, AdminSignInDto, AssertionDto } from './admin.dto';
import { AdminJwt, type AdminContext, type RequestMeta } from './admin.guard';
import { WebAuthnService } from './webauthn.service';

/** Admin passwords are typed by people, so they get a full-strength Argon2id. */
export const PASSWORD_HASH = { memoryCost: 64 * 1024, timeCost: 3, parallelism: 1 };
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const adminActor = (admin: { id: string; name: string }) => ({ type: 'admin' as const, id: admin.id, label: admin.name });
const CONSOLE = { label: 'Admin console' };

/** Admin sign-in (work email and password, then a hardware security key) and accepting an admin invite. */
@Injectable()
export class AdminAuthService {
  private readonly dummyHash = hash(randomBytes(16).toString('hex'), PASSWORD_HASH);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: AdminJwt,
    private readonly webauthn: WebAuthnService,
    private readonly audit: AuditService,
  ) {}

  private async invited(token: string) {
    const admin = await this.prisma.admin.findUnique({ where: { inviteHash: sha256(token) } });
    if (!admin?.inviteExpiresAt || admin.inviteExpiresAt < new Date()) throw new UnauthorizedException('This invite link is invalid or has expired');
    return admin;
  }

  /** The invite link was opened: challenge for registering the first security key. */
  async inviteOptions(token: string) {
    return this.webauthn.registrationOptions(await this.invited(token));
  }

  async acceptInvite(dto: AcceptInviteDto, meta: RequestMeta) {
    const admin = await this.invited(dto.token);
    const key = await this.webauthn.verifyRegistration(dto.challengeId, admin.id, dto.response);
    const passwordHash = await hash(dto.password, PASSWORD_HASH);
    await this.prisma.$transaction(async (tx) => {
      await tx.adminKey.create({ data: { ...key, adminId: admin.id } });
      await tx.admin.update({ where: { id: admin.id }, data: { passwordHash, status: 'ACTIVE', inviteHash: null, inviteExpiresAt: null } });
      await this.audit.record({ actor: adminActor(admin), action: 'admin.invite_accepted', category: 'admin', target: CONSOLE, ...meta, result: 'success' }, tx);
    });
  }

  /** Step 1: email and password. The answer is a security-key challenge, never a session. */
  async signIn(dto: AdminSignInDto, meta: RequestMeta) {
    const admin = await this.prisma.admin.findUnique({ where: { email: dto.email } });
    let passwordOk = false;
    if (admin?.passwordHash) passwordOk = await verify(admin.passwordHash, dto.password);
    else await verify(await this.dummyHash, dto.password); // same cost when there's no such admin
    if (!admin || !passwordOk) {
      // "not an admin" is logged as blocked, a wrong password as failed.
      const actor = admin ? adminActor(admin) : { type: 'user' as const, label: dto.email };
      await this.audit.record({ actor, action: 'admin.signin', category: 'signin', target: CONSOLE, ...meta, result: admin ? 'failed' : 'blocked' });
      throw new UnauthorizedException('Incorrect email, password or security key');
    }
    if (admin.status !== 'ACTIVE') {
      await this.audit.record({ actor: adminActor(admin), action: 'admin.signin', category: 'signin', target: CONSOLE, ...meta, result: 'blocked' });
      throw new ForbiddenException('This admin account is not active');
    }
    return this.webauthn.authenticationOptions(admin.id, 'signin');
  }

  /** Step 2: the security key. Returns a 15-minute session. */
  async verifySignIn(dto: AssertionDto, meta: RequestMeta) {
    let adminId: string;
    try {
      adminId = await this.webauthn.verifyAssertion(dto.challengeId, 'signin', dto.response);
    } catch (e) {
      await this.audit.record({ actor: { type: 'system', label: 'System' }, action: 'admin.signin_key', category: 'signin', target: CONSOLE, ...meta, result: 'failed' });
      throw e;
    }
    const admin = await this.prisma.admin.findUniqueOrThrow({ where: { id: adminId }, include: { role: true } });
    if (admin.status !== 'ACTIVE') throw new ForbiddenException('This admin account is not active');
    await this.prisma.admin.update({ where: { id: adminId }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ actor: adminActor(admin), action: 'admin.signin', category: 'signin', target: CONSOLE, ...meta, result: 'success' });
    return {
      accessToken: await this.jwt.signAsync({ sub: admin.id }),
      expiresIn: ADMIN_SESSION_MS / 1000,
      admin: { id: admin.id, email: admin.email, name: admin.name, isSuper: admin.isSuper, role: admin.role.name },
    };
  }

  /** A fresh security-key touch for privileged actions: confirming a recovery, handing over the super admin role. */
  stepUpOptions(admin: AdminContext) {
    return this.webauthn.authenticationOptions(admin.id, 'step-up');
  }

  verifyStepUp(admin: AdminContext, dto: AssertionDto) {
    return this.webauthn.verifyAssertion(dto.challengeId, 'step-up', dto.response, admin.id);
  }
}
