import { CRYPTO, TOTP, WRAPPED_KEY_BYTES } from '@rahasya/config';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsBytes, IsCiphertext } from '../common/bytes';

const CODE = new RegExp(`^\\d{${TOTP.digits}}$`);

export class KdfParamsDto {
  @IsInt() @Min(CRYPTO.argon2Min.memoryKiB) @Max(CRYPTO.argon2Max.memoryKiB) memoryKiB!: number;
  @IsInt() @Min(CRYPTO.argon2Min.iterations) @Max(CRYPTO.argon2Max.iterations) iterations!: number;
  /** libsodium's crypto_pwhash is single-lane. */
  @IsInt() @Equals(1) parallelism!: number;
}

export class DeviceDto {
  /** The id this device got at its last sign-in, so signing in again doesn't add a duplicate. */
  @IsOptional() @IsUUID('all') id?: string;
  @IsString() @Length(1, 64) name!: string;
  @IsIn(['android', 'web']) platform!: 'android' | 'web';
}

export class EmailDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

/** Sign-up. Everything here is derived on the device; the master password itself never arrives. */
export class RegisterDto extends EmailDto {
  @IsBytes(CRYPTO.keyBytes) authKey!: string;
  @IsBytes(CRYPTO.saltBytes) kdfSalt!: string;
  @IsDefined() @ValidateNested() @Type(() => KdfParamsDto) kdfParams!: KdfParamsDto;
  @IsCiphertext(WRAPPED_KEY_BYTES, WRAPPED_KEY_BYTES) wrappedVaultKey!: string;
  @IsDefined() @ValidateNested() @Type(() => DeviceDto) device!: DeviceDto;
}

export class LoginDto extends EmailDto {
  @IsBytes(CRYPTO.keyBytes) authKey!: string;
  @IsOptional() @Matches(CODE) totpCode?: string;
  @IsDefined() @ValidateNested() @Type(() => DeviceDto) device!: DeviceDto;
}

export class RefreshDto {
  /** 32 random bytes, base64url. */
  @IsString() @Length(43, 43) refreshToken!: string;
}

export class TotpCodeDto {
  @Matches(CODE) code!: string;
}

/** A new master password's derived values. Only the vault key's wrapping changes; items are never re-encrypted. */
export class NewCredentialsDto {
  @IsBytes(CRYPTO.keyBytes) authKey!: string;
  @IsBytes(CRYPTO.saltBytes) kdfSalt!: string;
  @IsDefined() @ValidateNested() @Type(() => KdfParamsDto) kdfParams!: KdfParamsDto;
  @IsCiphertext(WRAPPED_KEY_BYTES, WRAPPED_KEY_BYTES) wrappedVaultKey!: string;
}

/** Changing the master password: proves the current one, then replaces the derived values. */
export class RotateKeyDto extends NewCredentialsDto {
  @IsBytes(CRYPTO.keyBytes) currentAuthKey!: string;
}
