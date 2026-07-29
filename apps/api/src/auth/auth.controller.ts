import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  type ChangePasswordDto,
  type LoginDto,
  type RefreshDto,
} from '@mentivax/core';
import { ZodBody } from '../common/zod-body.pipe';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './auth.decorators';
import type { AuthUser } from './auth.types';

/**
 * Authentication. These routes are not tenant-scoped: the caller has not picked
 * an organization yet (login returns the list they may enter).
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  login(
    @Body(new ZodBody(loginSchema)) dto: LoginDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.login(dto, userAgent);
  }

  @Public()
  @Post('refresh')
  refresh(
    @Body(new ZodBody(refreshSchema)) dto: RefreshDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    return this.auth.refresh(dto.refreshToken, userAgent);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Body() body: { refreshToken?: string }) {
    return this.auth.logout(body?.refreshToken, user.id);
  }

  /** Re-reads the session — used on app boot to restore state from a token. */
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.session(user.id);
  }

  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodBody(changePasswordSchema)) dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(user.id, dto);
  }
}
