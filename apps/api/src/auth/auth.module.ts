import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../env';
import { AccessGuard } from './access.guard';
import { AccountController, AuthController, DevicesController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      // 'vault' keeps these tokens apart from the admin console's.
      useFactory: () => ({ secret: env('JWT_SECRET'), signOptions: { audience: 'vault' }, verifyOptions: { audience: 'vault' } }),
    }),
  ],
  controllers: [AuthController, DevicesController, AccountController],
  providers: [AuthService, AccessGuard],
  exports: [AccessGuard, JwtModule],
})
export class AuthModule {}
