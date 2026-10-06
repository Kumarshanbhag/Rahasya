import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma.service';
import { VaultModule } from './vault/vault.module';

/** Per-IP limit on the sign-in endpoints (vault and admin), prelogin and two-step codes. */
export const AUTH_RATE_LIMIT = { ttl: 60_000, limit: 20 };

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([AUTH_RATE_LIMIT]),
    AuthModule,
    VaultModule,
    AdminModule,
  ],
})
export class AppModule {}
