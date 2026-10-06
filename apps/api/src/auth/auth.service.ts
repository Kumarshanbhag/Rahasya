import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import { hash, verify } from '@node-rs/argon2';
import { CRYPTO, LOCKOUT, SESSION, TOTP } from '@rahasya/config';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { b64, bytes } from '../common/bytes';
import { env } from '../env';
import { Prisma, type User } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import type { AuthContext } from './access.guard';
import type { DeviceDto, LoginDto, RegisterDto, RotateKeyDto } from './auth.dto';
import { base32, matchTotp, seal, unseal } from './two-factor';

// authKey is already a 256-bit key, so the server's own Argon2id only needs OWASP's minimum cost.
const AUTH_HASH = { memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
// @node-rs/argon2's verify only takes UTF-8 text, so the key is hashed as hex (canonical, unlike base64).
const hashInput = (authKey: string) => Buffer.from(authKey, 'base64').toString('hex');
/** The server's Argon2id of an authKey: the only form in which it is stored. */
export const hashAuthKey = (authKey: string) => hash(hashInput(authKey), AUTH_HASH);

@Injectable()
export class AuthService {
  /** Verified against for unknown emails, so they take as long as real ones. */
  private readonly dummyHash = hash(randomBytes(32).toString('hex'), AUTH_HASH);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async prelogin(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { kdfSalt: true, kdfParams: true } });
    if (user) return { kdfSalt: b64(user.kdfSalt), kdfParams: user.kdfParams };
    // Unknown email: a stable fake salt, so prelogin can't be used to list accounts.
    const salt = createHmac('sha256', env('JWT_SECRET')).update(`prelogin:${email}`).digest().subarray(0, CRYPTO.saltBytes);
    return { kdfSalt: b64(salt), kdfParams: CRYPTO.argon2 };
  }

  async register(dto: RegisterDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          kdfSalt: bytes(dto.kdfSalt),
          kdfParams: { ...dto.kdfParams },
          authHash: await hashAuthKey(dto.authKey),
          wrappedVaultKey: bytes(dto.wrappedVaultKey),
        },
      });
      // If an admin invited this email, the invite is fulfilled now that the person has signed up.
      await this.prisma.userInvite.updateMany({ where: { email: dto.email, acceptedAt: null }, data: { acceptedAt: new Date() } });
      return this.startSession(user, dto.device);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw e;
    }
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      await verify(await this.dummyHash, hashInput(dto.authKey));
      throw new UnauthorizedException('Incorrect email or master password');
    }
    if (user.status !== 'ACTIVE') throw new ForbiddenException('This account is locked');

    const attempt = await this.takeTry(user.id);
    if (attempt === null) throw await this.waitError(user.id);
    const triesLeft = LOCKOUT.maxTries - attempt;
    const where = { device: `${dto.device.name} (${dto.device.platform})`, ip };
    const fail = async (message: string, twoFactorRequired?: boolean) => {
      if (triesLeft === 0) {
        await this.audit.record({
          actor: { type: 'system', label: 'System' },
          action: 'user.lockout',
          category: 'signin',
          target: { id: user.id, label: user.email },
          ...where,
          result: 'locked',
        });
      }
      return new UnauthorizedException({
        message,
        triesLeft,
        ...(triesLeft === 0 && { retryAfterMs: LOCKOUT.waitMs }),
        ...(twoFactorRequired && { twoFactorRequired }),
      });
    };

    if (!(await verify(user.authHash, hashInput(dto.authKey)))) throw await fail('Incorrect master password');
    let step: number | null = null;
    if (user.totpEnabled) {
      if (!dto.totpCode) throw await fail('Enter your two-step code', true);
      step = matchTotp(unseal(user.totpSecretEnc!), dto.totpCode, Date.now(), user.totpLastStep);
      if (step === null) throw await fail('Incorrect two-step code', true);
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), ...(step !== null && { totpLastStep: step }) },
    });
    await this.audit.record({
      actor: { type: 'user', id: user.id, label: user.email },
      action: 'user.signin',
      category: 'signin',
      target: { label: 'Vault' },
      ...where,
      result: 'success',
    });
    return this.startSession(user, dto.device);
  }

  /**
   * Claims one of the LOCKOUT.maxTries attempts atomically, before the key is checked, so parallel
   * guesses can't get past the limit. The try that reaches it starts the 30 s wait; a success clears it.
   * Returns the attempt number, or null while the account is waiting.
   */
  private async takeTry(userId: string): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ failed_logins: number }[]>`
      UPDATE users SET
        failed_logins = CASE WHEN locked_until IS NULL THEN failed_logins + 1 ELSE 1 END,
        locked_until = CASE WHEN (CASE WHEN locked_until IS NULL THEN failed_logins + 1 ELSE 1 END) >= ${LOCKOUT.maxTries}::int
                            THEN now() + ${LOCKOUT.waitMs}::int * interval '1 millisecond' END
      WHERE id = ${userId}::uuid AND (locked_until IS NULL OR locked_until <= now())
      RETURNING failed_logins`;
    return rows[0]?.failed_logins ?? null;
  }

  private async waitError(userId: string) {
    const { lockedUntil } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { lockedUntil: true } });
    const retryAfterMs = Math.max(0, (lockedUntil?.getTime() ?? 0) - Date.now());
    return new HttpException({ message: 'Too many attempts. Try again shortly.', retryAfterMs }, HttpStatus.TOO_MANY_REQUESTS);
  }

  private async startSession(user: Pick<User, 'id' | 'wrappedVaultKey'>, device: DeviceDto) {
    const known = device.id
      ? await this.prisma.device.findFirst({ where: { id: device.id, userId: user.id, revokedAt: null } })
      : null;
    const { id: deviceId } = known
      ? await this.prisma.device.update({ where: { id: known.id }, data: { name: device.name, lastSeenAt: new Date() } })
      : await this.prisma.device.create({ data: { userId: user.id, name: device.name, platform: device.platform } });
    // One live refresh token per device. Old ones are dropped, not revoked: a revoked token coming
    // back reads as theft and would sign this fresh session out.
    if (known) await this.prisma.refreshToken.deleteMany({ where: { deviceId } });
    return { userId: user.id, deviceId, wrappedVaultKey: b64(user.wrappedVaultKey), ...(await this.issueTokens(user.id, deviceId)) };
  }

  private async issueTokens(userId: string, deviceId: string) {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: { userId, deviceId, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + SESSION.refreshTtlMs) },
    });
    const accessToken = await this.jwt.signAsync({ sub: userId, did: deviceId }, { expiresIn: SESSION.accessTtlSec });
    return { accessToken, refreshToken, expiresIn: SESSION.accessTtlSec };
  }

  async refresh(token: string) {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
      include: { device: { select: { revokedAt: true } }, user: { select: { status: true } } },
    });
    if (!row) throw new UnauthorizedException();
    // Claiming is atomic. A token used twice (a stolen copy, or two refreshes racing) signs the device out.
    const claimed = await this.prisma.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (claimed.count === 0) {
      await this.revokeDevice(row.deviceId);
      throw new UnauthorizedException();
    }
    if (row.expiresAt <= new Date() || row.device.revokedAt || row.user.status !== 'ACTIVE') throw new UnauthorizedException();
    await this.prisma.device.update({ where: { id: row.deviceId }, data: { lastSeenAt: new Date() } });
    return this.issueTokens(row.userId, row.deviceId);
  }

  async revokeDevice(deviceId: string) {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: deviceId }, data: { revokedAt: now } }),
      this.prisma.refreshToken.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
  }

  async listDevices({ userId, deviceId }: AuthContext) {
    const devices = await this.prisma.device.findMany({ where: { userId, revokedAt: null }, orderBy: { lastSeenAt: 'desc' } });
    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      platform: d.platform,
      createdAt: d.createdAt,
      lastSeenAt: d.lastSeenAt,
      current: d.id === deviceId,
    }));
  }

  async signOutDevice({ userId }: AuthContext, id: string) {
    const device = await this.prisma.device.findFirst({ where: { id, userId, revokedAt: null } });
    if (!device) throw new NotFoundException('Device not found');
    await this.revokeDevice(id);
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpEnabled: true } });
    if (user.totpEnabled) throw new ConflictException('Two-step sign-in is already on');
    const secret = randomBytes(20);
    await this.prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: seal(secret) } });
    const key = base32(secret);
    const label = encodeURIComponent(`Rahasya:${user.email}`);
    return {
      secret: key,
      otpauthUrl: `otpauth://totp/${label}?secret=${key}&issuer=Rahasya&digits=${TOTP.digits}&period=${TOTP.periodSec}`,
    };
  }

  async verifyTwoFactor(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { totpSecretEnc: true, totpEnabled: true, totpLastStep: true },
    });
    if (user.totpEnabled) throw new ConflictException('Two-step sign-in is already on');
    if (!user.totpSecretEnc) throw new BadRequestException('Start two-step setup first');
    const step = matchTotp(unseal(user.totpSecretEnc), code, Date.now(), user.totpLastStep);
    if (step === null) throw new BadRequestException('Incorrect two-step code');
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabled: true, totpLastStep: step } });
    return { enabled: true };
  }

  // Only the vault key's wrapping changes, so entries never need re-encrypting.
  async rotateKey({ userId, deviceId }: AuthContext, dto: RotateKeyDto) {
    const { authHash } = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { authHash: true } });
    if (!(await verify(authHash, hashInput(dto.currentAuthKey)))) throw new UnauthorizedException('Incorrect master password');
    const now = new Date();
    const otherDevices = { userId, revokedAt: null, NOT: { id: deviceId } };
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          authHash: await hashAuthKey(dto.authKey),
          kdfSalt: bytes(dto.kdfSalt),
          kdfParams: { ...dto.kdfParams },
          wrappedVaultKey: bytes(dto.wrappedVaultKey),
        },
      }),
      // Other devices cache the vault key wrapped under the old password; sign them out so it stops working everywhere.
      this.prisma.device.updateMany({ where: otherDevices, data: { revokedAt: now } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null, NOT: { deviceId } }, data: { revokedAt: now } }),
    ]);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async dropExpiredTokens() {
    await this.prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  }
}
