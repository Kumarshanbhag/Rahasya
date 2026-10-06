import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuditService } from '../audit/audit.service';
import { AccessGuard, type AuthContext, CurrentAuth } from '../auth/access.guard';
import { NewCredentialsDto } from '../auth/auth.dto';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersService } from './admin-users.service';
import {
  AcceptInviteDto,
  AdminSignInDto,
  AssertionDto,
  AuditQuery,
  HandoverDto,
  InviteAdminDto,
  InviteTokenDto,
  InviteUserDto,
  ReasonDto,
  RecoveryQuery,
  RoleDto,
  SealedKeyDto,
  StartRecoveryDto,
  UpdateAdminDto,
  UpdateRoleDto,
  UsersQuery,
} from './admin.dto';
import { AdminGuard, type AdminContext, AdminIpGuard, CurrentAdmin, Meta, Permit, type RequestMeta } from './admin.guard';
import { AdminsService } from './admins.service';
import { RecoveryService } from './recovery.service';

/** Admin sign-in and accepting an admin invite. Allow-listed IPs only, rate-limited. */
@Controller('admin/auth')
@UseGuards(AdminIpGuard, ThrottlerGuard)
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('invite/options')
  @HttpCode(200)
  inviteOptions(@Body() dto: InviteTokenDto) {
    return this.auth.inviteOptions(dto.token);
  }

  @Post('invite/accept')
  @HttpCode(204)
  acceptInvite(@Body() dto: AcceptInviteDto, @Meta() meta: RequestMeta) {
    return this.auth.acceptInvite(dto, meta);
  }

  @Post('signin')
  @HttpCode(200)
  signIn(@Body() dto: AdminSignInDto, @Meta() meta: RequestMeta) {
    return this.auth.signIn(dto, meta);
  }

  @Post('signin/verify')
  @HttpCode(200)
  verifySignIn(@Body() dto: AssertionDto, @Meta() meta: RequestMeta) {
    return this.auth.verifySignIn(dto, meta);
  }

  @Post('step-up')
  @HttpCode(200)
  @UseGuards(AdminGuard)
  stepUp(@CurrentAdmin() admin: AdminContext) {
    return this.auth.stepUpOptions(admin);
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: AdminContext) {
    return admin;
  }
}

/** Managing user accounts: list, lock, suspend, re-enable, reset two-step sign-in, invite. */
@Controller('admin')
@UseGuards(AdminIpGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get('users')
  @Permit('users.view')
  list(@Query() query: UsersQuery) {
    return this.users.list(query);
  }

  @Post('users/:id/lock')
  @HttpCode(204)
  @Permit('users.manage')
  lock(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.users.setStatus(admin, meta, id, 'LOCKED', dto.reason);
  }

  @Post('users/:id/suspend')
  @HttpCode(204)
  @Permit('users.manage')
  suspend(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.users.setStatus(admin, meta, id, 'SUSPENDED', dto.reason);
  }

  /** Undoes a lock or suspension. */
  @Post('users/:id/activate')
  @HttpCode(204)
  @Permit('users.manage')
  activate(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.users.setStatus(admin, meta, id, 'ACTIVE', dto.reason);
  }

  @Post('users/:id/reset-2fa')
  @HttpCode(204)
  @Permit('users.manage')
  resetTwoFactor(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.users.resetTwoFactor(admin, meta, id, dto.reason);
  }

  @Post('invites')
  @Permit('users.manage')
  invite(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Body() dto: InviteUserDto) {
    return this.users.invite(admin, meta, dto.email);
  }
}

/** The audit log: read, verify the hash chain, export as CSV. Read-only. */
@Controller('admin/audit')
@UseGuards(AdminIpGuard, AdminGuard)
@Permit('audit.view')
export class AdminAuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Query() query: AuditQuery) {
    return this.audit.list(query);
  }

  @Get('verify')
  verify() {
    return this.audit.verify();
  }

  @Get('export')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="rahasya-audit-log.csv"')
  export(@Query() query: AuditQuery) {
    return this.audit.csv(query);
  }
}

/** Emergency recovery, the admin's side: request, confirm with a security key, cancel, recover after the wait. */
@Controller('admin/recovery')
@UseGuards(AdminIpGuard, AdminGuard)
@Permit('recovery')
export class AdminRecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  @Get()
  list(@Query() query: RecoveryQuery) {
    return this.recovery.list(query.status);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.recovery.detail(id);
  }

  @Post()
  start(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Body() dto: StartRecoveryDto) {
    return this.recovery.start(admin, meta, dto.userId, dto.reason);
  }

  @Post(':id/confirm')
  @HttpCode(200)
  confirm(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssertionDto) {
    return this.recovery.confirm(admin, meta, id, dto.challengeId, dto.response);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.recovery.cancelByAdmin(admin, meta, id, dto.reason);
  }

  @Get(':id/package')
  package(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string) {
    return this.recovery.package(admin, meta, id);
  }

  @Post(':id/complete')
  @HttpCode(204)
  complete(@CurrentAdmin() admin: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NewCredentialsDto) {
    return this.recovery.complete(admin, meta, id, dto);
  }
}

/** Emergency recovery, the user's side (vault app): opt in or out, see open requests and cancel them. */
@Controller()
@UseGuards(AccessGuard)
export class UserRecoveryController {
  constructor(private readonly recovery: RecoveryService) {}

  @Get('recovery/public-key')
  publicKey() {
    return this.recovery.publicKey();
  }

  @Put('account/recovery')
  @HttpCode(204)
  optIn(@CurrentAuth() auth: AuthContext, @Body() dto: SealedKeyDto) {
    return this.recovery.optIn(auth.userId, dto.sealedKey);
  }

  @Delete('account/recovery')
  @HttpCode(204)
  optOut(@CurrentAuth() auth: AuthContext) {
    return this.recovery.optOut(auth.userId);
  }

  @Get('recovery')
  mine(@CurrentAuth() auth: AuthContext) {
    return this.recovery.mine(auth.userId);
  }

  @Post('recovery/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.recovery.cancelByUser(auth.userId, id);
  }
}

/** Admins and roles. Every admin can look; only the super admin and Owners (admins.manage) can change anything. */
@Controller('admin')
@UseGuards(AdminIpGuard, AdminGuard)
export class AdminAdminsController {
  constructor(private readonly admins: AdminsService) {}

  @Get('admins')
  list(@CurrentAdmin() me: AdminContext) {
    return this.admins.list(me);
  }

  @Post('admins')
  @Permit('admins.manage')
  invite(@CurrentAdmin() me: AdminContext, @Meta() meta: RequestMeta, @Body() dto: InviteAdminDto) {
    return this.admins.invite(me, meta, dto);
  }

  @Patch('admins/:id')
  @HttpCode(204)
  @Permit('admins.manage')
  update(@CurrentAdmin() me: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAdminDto) {
    return this.admins.update(me, meta, id, dto);
  }

  @Delete('admins/:id')
  @HttpCode(204)
  @Permit('admins.manage')
  remove(@CurrentAdmin() me: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.admins.remove(me, meta, id, dto.reason);
  }

  @Get('roles')
  roles() {
    return this.admins.roles();
  }

  @Post('roles')
  @Permit('admins.manage')
  createRole(@CurrentAdmin() me: AdminContext, @Meta() meta: RequestMeta, @Body() dto: RoleDto) {
    return this.admins.createRole(me, meta, dto);
  }

  @Patch('roles/:id')
  @HttpCode(204)
  @Permit('admins.manage')
  updateRole(@CurrentAdmin() me: AdminContext, @Meta() meta: RequestMeta, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRoleDto) {
    return this.admins.updateRole(me, meta, id, dto);
  }

  @Post('super/handover')
  @HttpCode(204)
  handover(@CurrentAdmin() me: AdminContext, @Meta() meta: RequestMeta, @Body() dto: HandoverDto) {
    return this.admins.handover(me, meta, dto);
  }
}
