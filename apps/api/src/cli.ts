import './env';
import { NestFactory } from '@nestjs/core';
import { AdminsService } from './admin/admins.service';
import { AppModule } from './app.module';

const USAGE = `Server commands (run on the API host): pnpm --filter @rahasya/api admin <command>
  setup-super-admin <email> <name>                 create the one super admin and print their invite link
  break-glass <email> reset-keys|freeze|unfreeze   rescue a super admin whose security key is lost or stolen`;

async function main([command, email, arg]: string[]) {
  const breakGlass = arg === 'reset-keys' || arg === 'freeze' || arg === 'unfreeze';
  if (!email || !arg || (command !== 'setup-super-admin' && !(command === 'break-glass' && breakGlass))) {
    console.log(USAGE);
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  try {
    const admins = app.get(AdminsService);
    console.log(command === 'setup-super-admin' ? await admins.createSuperAdmin(email, arg) : await admins.breakGlass(email, arg as 'reset-keys' | 'freeze' | 'unfreeze'));
  } catch (e) {
    console.error((e as Error).message);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main(process.argv.slice(2));
