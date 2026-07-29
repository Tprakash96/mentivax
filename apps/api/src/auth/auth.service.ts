import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { effectiveModuleKeys, effectivePermissions } from '@mentivax/core';
import type { ChangePasswordDto, LoginDto } from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import type { AccessTokenPayload, AuthUser } from './auth.types';

/** Access tokens are short-lived; the refresh token carries the long session. */
const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '15m';
const REFRESH_TTL_DAYS = Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30);

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, for proactive client refresh. */
  expiresIn: number;
}

export interface MembershipView {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  shortCode: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  /** Permissions on modules the org actually has enabled. */
  permissions: string[];
}

export interface SessionView {
  user: { id: string; email: string; name: string; isPlatformAdmin: boolean };
  memberships: MembershipView[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
  ) {}

  // --- Sign in ---------------------------------------------------------------

  async login(dto: LoginDto, userAgent?: string): Promise<AuthTokens & SessionView> {
    // Look the user up case-insensitively; emails are stored as entered.
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
    });

    // Always run the hash comparison, even for an unknown email, so response
    // timing does not reveal which accounts exist.
    const ok = await this.passwords.verify(dto.password, user?.passwordHash ?? null);
    if (!user || !ok) throw new UnauthorizedException('Incorrect email or password');
    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.isPlatformAdmin, userAgent);
    const session = await this.session(user.id);
    return { ...tokens, ...session };
  }

  // --- Session ---------------------------------------------------------------

  /**
   * The full picture the client needs after sign-in: who you are, which schools
   * you can enter, and what you may do in each. Permissions are intersected
   * with the org's enabled modules, so plugging out Fees revokes fee
   * permissions everywhere without editing a single role.
   */
  async session(userId: string): Promise<SessionView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { isActive: true, organization: { isActive: true } },
          include: {
            organization: { include: { modules: true } },
            role: { include: { permissions: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    const now = new Date();
    const memberships: MembershipView[] = user.memberships.map((m) => {
      const enabled = effectiveModuleKeys(
        m.organization.modules
          .filter(
            (r) =>
              (r.status === 'ACTIVE' || r.status === 'TRIAL') &&
              (r.expiresAt === null || r.expiresAt > now),
          )
          .map((r) => r.moduleKey),
      );
      const granted = m.role.permissions.map((p) => p.permission);
      return {
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        organizationSlug: m.organization.slug,
        shortCode: m.organization.shortCode,
        roleId: m.roleId,
        roleKey: m.role.key,
        roleName: m.role.name,
        permissions: effectivePermissions(granted, enabled),
      };
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isPlatformAdmin: user.isPlatformAdmin,
      },
      memberships,
    };
  }

  // --- Tokens ----------------------------------------------------------------

  private async issueTokens(
    userId: string,
    email: string,
    isPlatformAdmin: boolean,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const payload: AccessTokenPayload = { sub: userId, email, pa: isPlatformAdmin };
    // Pass seconds rather than the "15m" string: @nestjs/jwt types expiresIn as
    // a `ms` template literal, which a plain env-var string does not satisfy.
    const ttl = ttlSeconds(ACCESS_TTL);
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: ttl });

    // Refresh tokens are opaque random strings, stored only as a SHA-256 hash.
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt,
        userAgent: userAgent?.slice(0, 250),
      },
    });

    return { accessToken, refreshToken, expiresIn: ttl };
  }

  /**
   * Exchanges a refresh token for a fresh pair, rotating the old one.
   *
   * Reuse of an already-revoked token means the token leaked, so every session
   * for that user is revoked as a precaution.
   */
  async refresh(refreshToken: string, userAgent?: string): Promise<AuthTokens & SessionView> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });

    if (!row) throw new UnauthorizedException('Invalid refresh token');

    if (row.revokedAt) {
      this.logger.warn(`Refresh token reuse detected for user ${row.userId}; revoking all sessions`);
      await this.revokeAll(row.userId);
      throw new UnauthorizedException('Session expired, please sign in again');
    }

    if (row.expiresAt <= new Date()) throw new UnauthorizedException('Session expired, please sign in again');
    if (!row.user.isActive) throw new UnauthorizedException('This account has been deactivated');

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens(
      row.user.id,
      row.user.email,
      row.user.isPlatformAdmin,
      userAgent,
    );
    const session = await this.session(row.user.id);
    return { ...tokens, ...session };
  }

  async logout(refreshToken: string | undefined, userId: string): Promise<{ ok: true }> {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: hashToken(refreshToken), userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { ok: true };
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Verifies an access token and loads the principal. Used by AuthMiddleware. */
  async verifyAccessToken(token: string): Promise<AuthUser | null> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      return null;
    }

    // Re-read the user so deactivation and role changes take effect
    // immediately rather than at token expiry.
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isPlatformAdmin: user.isPlatformAdmin,
    };
  }

  // --- Password --------------------------------------------------------------

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists');

    const ok = await this.passwords.verify(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(dto.newPassword) },
    });

    // Changing a password invalidates every other session.
    await this.revokeAll(userId);
    return { ok: true };
  }
}

/** Refresh tokens are high-entropy random strings, so a plain SHA-256 (no salt)
 * is sufficient and keeps lookups a single indexed query. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Converts a `15m` / `2h` / `900` TTL into seconds for the client. */
function ttlSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])?$/.exec(ttl.trim());
  if (!m?.[1]) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'd':
      return n * 86_400;
    case 'h':
      return n * 3_600;
    case 'm':
      return n * 60;
    default:
      return n;
  }
}
