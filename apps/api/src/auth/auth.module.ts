import { Global, Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

/**
 * The signing secret. In development we fall back to the value in .env; in
 * production an unset secret is fatal rather than silently insecure.
 */
function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret !== 'dev-only-change-me') return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a strong unique value in production');
  }
  new Logger('AuthModule').warn(
    'Using the development JWT secret. Set JWT_SECRET before deploying.',
  );
  return secret ?? 'dev-only-change-me';
}

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret(),
      signOptions: { issuer: 'mentivax' },
      verifyOptions: { issuer: 'mentivax' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
