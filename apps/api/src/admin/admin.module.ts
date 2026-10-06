import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminAuthService } from './admin-auth.service';
import { AdminUsersService } from './admin-users.service';
import {
  AdminAdminsController,
  AdminAuditController,
  AdminAuthController,
  AdminRecoveryController,
  AdminUsersController,
  UserRecoveryController,
} from './admin.controller';
import { AdminGuard, AdminIpGuard, AdminJwt } from './admin.guard';
import { AdminsService } from './admins.service';
import { RecoveryService } from './recovery.service';
import { WebAuthnService } from './webauthn.service';

@Module({
  imports: [AuthModule],
  controllers: [AdminAuthController, AdminUsersController, AdminAuditController, AdminRecoveryController, AdminAdminsController, UserRecoveryController],
  providers: [AdminJwt, AdminGuard, AdminIpGuard, WebAuthnService, AdminAuthService, AdminUsersService, RecoveryService, AdminsService],
})
export class AdminModule {}
