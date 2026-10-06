import { Body, Controller, Delete, Get, HttpCode, Ip, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AccessGuard, type AuthContext, CurrentAuth } from './access.guard';
import { EmailDto, LoginDto, RefreshDto, RegisterDto, RotateKeyDto, TotpCodeDto } from './auth.dto';
import { AuthService } from './auth.service';

/** Welcome, sign up, sign in and two-step setup. Rate-limited per IP. */
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('prelogin')
  @HttpCode(200)
  prelogin(@Body() dto: EmailDto) {
    return this.auth.prelogin(dto.email);
  }

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.auth.login(dto, ip);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(AccessGuard)
  logout(@CurrentAuth() auth: AuthContext) {
    return this.auth.revokeDevice(auth.deviceId);
  }

  @Post('2fa/setup')
  @HttpCode(200)
  @UseGuards(AccessGuard)
  setupTwoFactor(@CurrentAuth() auth: AuthContext) {
    return this.auth.setupTwoFactor(auth.userId);
  }

  @Post('2fa/verify')
  @HttpCode(200)
  @UseGuards(AccessGuard)
  verifyTwoFactor(@CurrentAuth() auth: AuthContext, @Body() dto: TotpCodeDto) {
    return this.auth.verifyTwoFactor(auth.userId, dto.code);
  }
}

/** The user's signed-in devices, so a lost phone or laptop can be signed out remotely. */
@Controller('devices')
@UseGuards(AccessGuard)
export class DevicesController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.auth.listDevices(auth);
  }

  @Delete(':id')
  @HttpCode(204)
  signOut(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.auth.signOutDevice(auth, id);
  }
}

/** Changing the master password from settings. */
@Controller('account')
@UseGuards(AccessGuard)
export class AccountController {
  constructor(private readonly auth: AuthService) {}

  @Post('rotate-key')
  @HttpCode(204)
  rotateKey(@CurrentAuth() auth: AuthContext, @Body() dto: RotateKeyDto) {
    return this.auth.rotateKey(auth, dto);
  }
}
