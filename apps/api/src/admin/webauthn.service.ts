import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { randomUUID } from 'node:crypto';
import { env } from '../env';
import { PrismaService } from '../prisma.service';

type Purpose = 'register' | 'signin' | 'step-up';
type Pending = { challenge: string; adminId: string; purpose: Purpose; expiresAt: number };

const CHALLENGE_TTL_MS = 5 * 60_000;
const rp = () => ({ rpID: env('ADMIN_RP_ID'), origin: env('ADMIN_ORIGIN') });
const transports = (list: string[]) => list as AuthenticatorTransport[];

/** Hardware security keys and passkeys for admins (WebAuthn). Challenges are single-use and expire in 5 minutes. */
@Injectable()
export class WebAuthnService {
  // ponytail: challenges live in memory, which holds for one API instance; move them to the database to run more.
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly prisma: PrismaService) {}

  private remember(adminId: string, purpose: Purpose, challenge: string) {
    const now = Date.now();
    for (const [id, p] of this.pending) if (p.expiresAt < now) this.pending.delete(id);
    const challengeId = randomUUID();
    this.pending.set(challengeId, { challenge, adminId, purpose, expiresAt: now + CHALLENGE_TTL_MS });
    return challengeId;
  }

  private take(challengeId: string, purpose: Purpose, adminId?: string) {
    const p = this.pending.get(challengeId);
    this.pending.delete(challengeId);
    if (!p || p.purpose !== purpose || p.expiresAt < Date.now() || (adminId && p.adminId !== adminId)) {
      throw new UnauthorizedException('The security key check expired. Try again.');
    }
    return p;
  }

  async registrationOptions(admin: { id: string; email: string; name: string }) {
    const existing = await this.prisma.adminKey.findMany({ where: { adminId: admin.id } });
    const options = await generateRegistrationOptions({
      rpName: 'Rahasya Admin',
      rpID: rp().rpID,
      userName: admin.email,
      userDisplayName: admin.name,
      userID: new Uint8Array(Buffer.from(admin.id.replaceAll('-', ''), 'hex')),
      attestationType: 'none',
      excludeCredentials: existing.map((k) => ({ id: k.id, transports: transports(k.transports) })),
      authenticatorSelection: { residentKey: 'discouraged', userVerification: 'preferred' },
    });
    return { challengeId: this.remember(admin.id, 'register', options.challenge), options };
  }

  /** The new key's credential, ready to store. */
  async verifyRegistration(challengeId: string, adminId: string, response: RegistrationResponseJSON) {
    const { challenge } = this.take(challengeId, 'register', adminId);
    const { rpID, origin } = rp();
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    }).catch(() => null);
    if (!result?.verified) throw new UnauthorizedException('The security key was not accepted');
    const { credential } = result.registrationInfo;
    return { id: credential.id, publicKey: credential.publicKey, counter: BigInt(credential.counter), transports: credential.transports ?? [] };
  }

  async authenticationOptions(adminId: string, purpose: 'signin' | 'step-up') {
    const keys = await this.prisma.adminKey.findMany({ where: { adminId } });
    if (!keys.length) throw new UnauthorizedException('No security key registered');
    const options = await generateAuthenticationOptions({
      rpID: rp().rpID,
      allowCredentials: keys.map((k) => ({ id: k.id, transports: transports(k.transports) })),
      userVerification: 'preferred',
    });
    return { challengeId: this.remember(adminId, purpose, options.challenge), options };
  }

  /** Checks a security-key assertion and returns whose it was. Pass `adminId` to require a particular admin. */
  async verifyAssertion(challengeId: string, purpose: 'signin' | 'step-up', response: AuthenticationResponseJSON, adminId?: string) {
    const pending = this.take(challengeId, purpose, adminId);
    const key = await this.prisma.adminKey.findUnique({ where: { id: String(response?.id) } });
    if (!key || key.adminId !== pending.adminId) throw new UnauthorizedException('The security key was not accepted');
    const { rpID, origin } = rp();
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: key.id, publicKey: key.publicKey, counter: Number(key.counter), transports: transports(key.transports) },
      requireUserVerification: false,
    }).catch(() => null);
    if (!result?.verified) throw new UnauthorizedException('The security key was not accepted');
    await this.prisma.adminKey.update({
      where: { id: key.id },
      data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() },
    });
    return pending.adminId;
  }
}
