import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ADMIN_PERMISSIONS, ADMIN_SESSION_MS, type AdminPermission } from '@rahasya/config';
import type { Request } from 'express';
import { BlockList, isIP } from 'node:net';
import { env } from '../env';
import { PrismaService } from '../prisma.service';

export type AdminContext = { id: string; email: string; name: string; isSuper: boolean; role: string; permissions: string[] };
type AdminRequest = Request & { admin?: AdminContext };

/** Admin console tokens: audience 'admin', 15 minutes, never accepted by the vault API (and vice versa). */
@Injectable()
export class AdminJwt extends JwtService {
  constructor() {
    super({
      secret: env('JWT_SECRET'),
      signOptions: { audience: 'admin', expiresIn: ADMIN_SESSION_MS / 1000 },
      verifyOptions: { audience: 'admin' },
    });
  }
}

/** ADMIN_IP_ALLOWLIST: comma-separated addresses and CIDR ranges, or '*' for any. Unset means nobody. */
export function ipAllowed(ip: string | undefined, list = process.env.ADMIN_IP_ALLOWLIST ?? '') {
  if (list.trim() === '*') return true;
  const address = ip?.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '');
  if (!address || !isIP(address)) return false;
  const allowed = new BlockList();
  for (const entry of list.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [net = '', bits] = entry.split('/');
    const type = isIP(net) === 6 ? 'ipv6' : 'ipv4';
    if (bits) allowed.addSubnet(net, Number(bits), type);
    else allowed.addAddress(net, type);
  }
  return allowed.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
}

/** Every admin route, signed in or not, is only reachable from the allow-list. */
@Injectable()
export class AdminIpGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    if (!ipAllowed(ctx.switchToHttp().getRequest<Request>().ip)) throw new ForbiddenException('This address is not allowed to reach the admin console');
    return true;
  }
}

/** The permission a route needs; the admin's role must include it. */
export const Permit = Reflector.createDecorator<AdminPermission>();

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: AdminJwt,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization ?? '')?.[1];
    const claims = token ? await this.jwt.verifyAsync<{ sub: string }>(token).catch(() => null) : null;
    if (!claims) throw new UnauthorizedException();
    // Checked on every request, so a suspended or removed admin loses access at once.
    const admin = await this.prisma.admin.findUnique({ where: { id: claims.sub }, include: { role: true } });
    if (!admin || admin.status !== 'ACTIVE') throw new UnauthorizedException();
    const permissions = admin.isSuper ? [...ADMIN_PERMISSIONS] : admin.role.permissions;
    const needed = this.reflector.getAllAndOverride(Permit, [ctx.getHandler(), ctx.getClass()]);
    if (needed && !permissions.includes(needed)) throw new ForbiddenException('Your role does not allow this');
    req.admin = { id: admin.id, email: admin.email, name: admin.name, isSuper: admin.isSuper, role: admin.role.name, permissions };
    return true;
  }
}

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AdminRequest>().admin!);

/** Where a request came from, for the audit log's Device and IP columns. */
export type RequestMeta = { ip?: string; device: string };

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip, device: deviceLabel(req.headers['user-agent']) };
});

/** A short device name for the audit log ("Chrome", "Android"). TODO: add the city, which needs a GeoIP database. */
export function deviceLabel(userAgent = '') {
  const known: [RegExp, string][] = [[/Edg\//, 'Edge'], [/Firefox\//, 'Firefox'], [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari'], [/Android|okhttp/i, 'Android']];
  return known.find(([re]) => re.test(userAgent))?.[1] ?? (userAgent.slice(0, 60) || 'Unknown');
}
