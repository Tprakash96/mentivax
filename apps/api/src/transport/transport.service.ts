import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateRouteDto,
  CreateStopDto,
  SaveStopFaresDto,
  UpdateRouteDto,
  UpdateStopDto,
} from '@mentivax/core';
import { PrismaService } from '../prisma/prisma.service';
import type { TenantContext } from '../tenant/tenant.types';

type StopRecord = {
  id: string;
  routeId: string;
  name: string;
  bothWayFare: number;
  oneWayFare: number;
  rank: number;
};

@Injectable()
export class TransportService {
  constructor(private readonly prisma: PrismaService) {}

  private stopDto(s: StopRecord) {
    return {
      id: s.id,
      routeId: s.routeId,
      name: s.name,
      bothWayFare: s.bothWayFare,
      oneWayFare: s.oneWayFare,
      rank: s.rank,
    };
  }

  /** All routes for the active year, each with its ordered stops. */
  async listRoutes(t: TenantContext) {
    const routes = await this.prisma.transportRoute.findMany({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
      orderBy: { rank: 'asc' },
      include: { stops: { orderBy: { rank: 'asc' } } },
    });
    return routes.map((r) => ({
      id: r.id,
      name: r.name,
      vehicleNumber: r.vehicleNumber,
      vehicleType: r.vehicleType,
      rank: r.rank,
      stops: r.stops.map((s) => this.stopDto(s)),
    }));
  }

  async createRoute(t: TenantContext, dto: CreateRouteDto) {
    const rank = dto.rank ?? (await this.nextRouteRank(t));
    await this.prisma.transportRoute.create({
      data: {
        organizationId: t.organizationId,
        academicYearId: t.academicYearId,
        name: dto.name.trim(),
        vehicleNumber: dto.vehicleNumber.trim(),
        vehicleType: dto.vehicleType,
        rank,
      },
    });
    return this.listRoutes(t);
  }

  async updateRoute(t: TenantContext, id: string, dto: UpdateRouteDto) {
    const { count } = await this.prisma.transportRoute.updateMany({
      where: { id, organizationId: t.organizationId, academicYearId: t.academicYearId },
      data: {
        name: dto.name?.trim(),
        vehicleNumber: dto.vehicleNumber?.trim(),
        vehicleType: dto.vehicleType,
        rank: dto.rank,
      },
    });
    if (count === 0) throw new NotFoundException('Route not found');
    return this.listRoutes(t);
  }

  async deleteRoute(t: TenantContext, id: string) {
    // Stops cascade; assigned students' transportStopId is set null (schema).
    const { count } = await this.prisma.transportRoute.deleteMany({
      where: { id, organizationId: t.organizationId, academicYearId: t.academicYearId },
    });
    if (count === 0) throw new NotFoundException('Route not found');
    return this.listRoutes(t);
  }

  async createStop(t: TenantContext, dto: CreateStopDto) {
    const route = await this.prisma.transportRoute.findFirst({
      where: { id: dto.routeId, organizationId: t.organizationId, academicYearId: t.academicYearId },
    });
    if (!route) throw new BadRequestException('Route not found');
    const top = await this.prisma.transportStop.findFirst({
      where: { routeId: dto.routeId },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });
    await this.prisma.transportStop.create({
      data: {
        organizationId: t.organizationId,
        routeId: dto.routeId,
        name: dto.name.trim(),
        bothWayFare: dto.bothWayFare,
        oneWayFare: dto.oneWayFare,
        rank: dto.rank ?? (top?.rank ?? -1) + 1,
      },
    });
    return this.listRoutes(t);
  }

  async updateStop(t: TenantContext, id: string, dto: UpdateStopDto) {
    const { count } = await this.prisma.transportStop.updateMany({
      where: { id, organizationId: t.organizationId },
      data: {
        name: dto.name?.trim(),
        bothWayFare: dto.bothWayFare,
        oneWayFare: dto.oneWayFare,
        rank: dto.rank,
      },
    });
    if (count === 0) throw new NotFoundException('Stop not found');
    return this.listRoutes(t);
  }

  async deleteStop(t: TenantContext, id: string) {
    const { count } = await this.prisma.transportStop.deleteMany({
      where: { id, organizationId: t.organizationId },
    });
    if (count === 0) throw new NotFoundException('Stop not found');
    return this.listRoutes(t);
  }

  /** Bulk-save fares from the transport mapping grid. */
  async saveFares(t: TenantContext, dto: SaveStopFaresDto) {
    await this.prisma.$transaction(
      dto.fares.map((f) =>
        this.prisma.transportStop.updateMany({
          where: { id: f.stopId, organizationId: t.organizationId },
          data: { bothWayFare: f.bothWayFare, oneWayFare: f.oneWayFare },
        }),
      ),
    );
    return this.listRoutes(t);
  }

  private async nextRouteRank(t: TenantContext): Promise<number> {
    const top = await this.prisma.transportRoute.findFirst({
      where: { organizationId: t.organizationId, academicYearId: t.academicYearId },
      orderBy: { rank: 'desc' },
      select: { rank: true },
    });
    return (top?.rank ?? -1) + 1;
  }
}
