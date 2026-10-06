import { ADMIN_PERMISSIONS, MASTER_PASSWORD, SEALED_KEY_BYTES } from '@rahasya/config';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsEmail, IsIn, IsObject, IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
import { IsBytes } from '../common/bytes';

const normalizeEmail = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class AdminEmailDto {
  @Transform(normalizeEmail) @IsEmail() @MaxLength(254) email!: string;
}

/** Admin sign-in, first step: email and password. The security key is the second step. */
export class AdminSignInDto extends AdminEmailDto {
  @IsString() @Length(1, 256) password!: string;
}

/** A security-key answer to a challenge the API issued (sign-in or step-up). */
export class AssertionDto {
  @IsUUID('all') challengeId!: string;
  // The WebAuthn library validates the structure itself.
  @IsObject() response!: AuthenticationResponseJSON;
}

export class InviteTokenDto {
  /** 32 random bytes, base64url. */
  @IsString() @Length(43, 43) token!: string;
}

/** Accepting an admin invite: set a password and register the first security key. */
export class AcceptInviteDto extends InviteTokenDto {
  @IsString() @Length(MASTER_PASSWORD.minLength, 256) password!: string;
  @IsUUID('all') challengeId!: string;
  @IsObject() response!: RegistrationResponseJSON;
}

/** Every action on someone else's account carries a typed reason for the audit log. */
export class ReasonDto {
  @IsString() @Length(3, 500) reason!: string;
}

export class InviteUserDto extends AdminEmailDto {}

export class InviteAdminDto extends AdminEmailDto {
  @IsString() @Length(1, 100) name!: string;
  @IsUUID('all') roleId!: string;
}

export class UpdateAdminDto extends ReasonDto {
  @IsOptional() @IsUUID('all') roleId?: string;
  @IsOptional() @IsIn(['ACTIVE', 'SUSPENDED']) status?: 'ACTIVE' | 'SUSPENDED';
}

export class RoleDto {
  @IsString() @Length(1, 60) name!: string;
  @IsArray() @ArrayUnique() @IsIn(ADMIN_PERMISSIONS, { each: true }) permissions!: string[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @Length(1, 60) name?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(ADMIN_PERMISSIONS, { each: true }) permissions?: string[];
}

export class HandoverDto extends AssertionDto {
  @IsUUID('all') adminId!: string;
}

export class UsersQuery {
  @IsOptional() @IsIn(['all', 'locked', 'invited', 'no2fa']) filter?: 'all' | 'locked' | 'invited' | 'no2fa';
  @IsOptional() @IsString() @MaxLength(254) search?: string;
}

export class AuditQuery {
  @IsOptional() @IsIn(['signin', 'admin', 'emergency']) category?: 'signin' | 'admin' | 'emergency';
  @IsOptional() @IsString() @MaxLength(254) search?: string;
  /** Entry id to page back from (newest first). */
  @IsOptional() @Matches(/^\d{1,19}$/) before?: string;
}

export class StartRecoveryDto extends ReasonDto {
  @IsUUID('all') userId!: string;
}

export class RecoveryQuery {
  @IsOptional() @IsIn(['open', 'all']) status?: 'open' | 'all';
}

/** The user's opt-in copy of the vault key, sealed on the device to the organisation's offline public key. */
export class SealedKeyDto {
  @IsBytes(SEALED_KEY_BYTES) sealedKey!: string;
}
