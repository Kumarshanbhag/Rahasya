import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';

export type AuthContext = { userId: string; deviceId: string };
type AuthedRequest = Request & { auth?: AuthContext };

/** Vault-app access token (15 min JWT). The device is checked on every request, so signing it out takes effect at once. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    const claims = token ? await this.jwt.verifyAsync<{ sub: string; did: string }>(token).catch(() => null) : null;
    if (!claims) throw new UnauthorizedException();
    const device = await this.prisma.device.findUnique({
      where: { id: claims.did },
      select: { userId: true, revokedAt: true, user: { select: { status: true } } },
    });
    if (!device || device.revokedAt || device.userId !== claims.sub) throw new UnauthorizedException();
    if (device.user.status !== 'ACTIVE') throw new ForbiddenException('This account is locked');
    req.auth = { userId: claims.sub, deviceId: claims.did };
    return true;
  }
}

export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthedRequest>().auth!,
);
