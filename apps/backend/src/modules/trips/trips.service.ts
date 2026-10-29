import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthContext } from '../identity/types/auth-context';
import type { CreateTripDraftDto } from './dto/create-trip-draft.dto';
import type { SubmitTripDto } from './dto/submit-trip.dto';

const tripInclude = {
  corridor: {
    select: {
      id: true,
      originCountry: true,
      originCity: true,
      destinationCountry: true,
      destinationCity: true,
      currency: true,
      isActive: true,
    },
  },
} satisfies Prisma.TripInclude;

type TripRecord = Prisma.TripGetPayload<{
  include: typeof tripInclude;
}>;

type TripValidationDb = Pick<Prisma.TransactionClient, 'corridor'>;

@Injectable()
export class TripsService {
  constructor(private readonly prisma: PrismaService) {}

  async options(auth: AuthContext) {
    this.ensureCarrier(auth);

    const corridors = await this.prisma.corridor.findMany({
      where: { isActive: true },
      orderBy: [
        { originCountry: 'asc' },
        { originCity: 'asc' },
        { destinationCountry: 'asc' },
        { destinationCity: 'asc' },
      ],
      select: {
        id: true,
        originCountry: true,
        originCity: true,
        destinationCountry: true,
        destinationCity: true,
        currency: true,
      },
    });

    return { corridors };
  }

  async listMine(auth: AuthContext) {
    this.ensureCarrier(auth);

    const trips = await this.prisma.trip.findMany({
      where: { carrierId: auth.userId },
      include: tripInclude,
      orderBy: { departureAt: 'asc' },
      take: 100,
    });

    return trips.map((trip) => this.toResponse(trip));
  }

  async listPendingForReview(auth: AuthContext) {
    this.ensureOperator(auth);

    const trips = await this.prisma.trip.findMany({
      where: { status: 'PENDING_REVIEW' },
      include: tripInclude,
      orderBy: { departureAt: 'asc' },
      take: 100,
    });

    return trips.map((trip) => ({
      ...this.toResponse(trip),
      carrierId: trip.carrierId,
    }));
  }

  async getMine(auth: AuthContext, id: string) {
    this.ensureCarrier(auth);

    const trip = await this.prisma.trip.findFirst({
      where: {
        id,
        carrierId: auth.userId,
      },
      include: tripInclude,
    });

    if (!trip) {
      throw new NotFoundException({
        code: 'TRIP_NOT_FOUND',
        message: 'Ce voyage est introuvable.',
      });
    }

    return this.toResponse(trip);
  }

  async createDraft(
    auth: AuthContext,
    input: CreateTripDraftDto,
    requestId?: string,
  ) {
    this.ensureCarrier(auth);
    const departureAt = new Date(input.departureAt);
    this.assertFutureDeparture(departureAt);

    return this.prisma.$transaction(async (tx) => {
      await this.assertCorridorAvailable(tx, input.corridorId);

      const trip = await tx.trip.create({
        data: {
          carrierId: auth.userId,
          corridorId: input.corridorId,
          flightNo: this.normalizeFlightNo(input.flightNo),
          departureAt,
          capacityKg: input.capacityKg,
        },
        include: tripInclude,
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          requestId: requestId ?? null,
          action: 'trip.draft.create',
          entity: 'trip',
          entityId: trip.id,
          metadata: {
            corridorId: trip.corridorId,
            flightNo: trip.flightNo,
            departureAt: trip.departureAt.toISOString(),
            capacityKg: trip.capacityKg.toString(),
          },
        },
      });

      return this.toResponse(trip);
    });
  }

  async submit(
    auth: AuthContext,
    id: string,
    input: SubmitTripDto,
    requestId?: string,
  ) {
    this.ensureCarrier(auth);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.trip.findFirst({
        where: {
          id,
          carrierId: auth.userId,
        },
        include: tripInclude,
      });

      if (!current) {
        throw new NotFoundException({
          code: 'TRIP_NOT_FOUND',
          message: 'Ce voyage est introuvable.',
        });
      }

      if (current.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'TRIP_NOT_DRAFT',
          message: 'Ce voyage a déjà quitté l’état brouillon.',
        });
      }

      if (current.version !== input.version) {
        throw new ConflictException({
          code: 'TRIP_VERSION_CONFLICT',
          message: 'Le voyage a été modifié. Actualisez avant de continuer.',
        });
      }

      await this.assertTripCanProgress(tx, current);

      const updated = await tx.trip.updateMany({
        where: {
          id: current.id,
          carrierId: auth.userId,
          status: 'DRAFT',
          version: input.version,
        },
        data: {
          status: 'PENDING_REVIEW',
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'TRIP_VERSION_CONFLICT',
          message: 'Le voyage a été modifié. Actualisez avant de continuer.',
        });
      }

      await tx.outboxEvent.create({
        data: {
          aggregate: 'trip',
          aggregateId: current.id,
          eventType: 'trip.submitted',
          payload: {
            tripId: current.id,
            carrierId: auth.userId,
            corridorId: current.corridorId,
            flightNo: current.flightNo,
            departureAt: current.departureAt.toISOString(),
            version: input.version + 1,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          requestId: requestId ?? null,
          action: 'trip.submit',
          entity: 'trip',
          entityId: current.id,
          metadata: {
            fromStatus: 'DRAFT',
            toStatus: 'PENDING_REVIEW',
            version: input.version + 1,
          },
        },
      });

      const submitted = await tx.trip.findUniqueOrThrow({
        where: { id: current.id },
        include: tripInclude,
      });

      return this.toResponse(submitted);
    });
  }

  async approve(
    auth: AuthContext,
    id: string,
    version: number,
    requestId?: string,
  ) {
    this.ensureOperator(auth);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.trip.findUnique({
        where: { id },
        include: tripInclude,
      });

      if (!current) {
        throw new NotFoundException({
          code: 'TRIP_NOT_FOUND',
          message: 'Ce voyage est introuvable.',
        });
      }

      if (current.status !== 'PENDING_REVIEW') {
        throw new ConflictException({
          code: 'TRIP_NOT_PENDING_REVIEW',
          message: 'Ce voyage n’est pas en attente de revue.',
        });
      }

      if (current.version !== version) {
        throw new ConflictException({
          code: 'TRIP_VERSION_CONFLICT',
          message: 'Le voyage a été modifié. Actualisez avant de continuer.',
        });
      }

      await this.assertTripCanProgress(tx, current);

      const updated = await tx.trip.updateMany({
        where: {
          id: current.id,
          status: 'PENDING_REVIEW',
          version,
        },
        data: {
          status: 'APPROVED',
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'TRIP_VERSION_CONFLICT',
          message: 'Le voyage a été modifié. Actualisez avant de continuer.',
        });
      }

      await tx.outboxEvent.create({
        data: {
          aggregate: 'trip',
          aggregateId: current.id,
          eventType: 'trip.approved',
          payload: {
            tripId: current.id,
            carrierId: current.carrierId,
            corridorId: current.corridorId,
            flightNo: current.flightNo,
            departureAt: current.departureAt.toISOString(),
            version: version + 1,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          requestId: requestId ?? null,
          action: 'trip.approve',
          entity: 'trip',
          entityId: current.id,
          metadata: {
            carrierId: current.carrierId,
            fromStatus: 'PENDING_REVIEW',
            toStatus: 'APPROVED',
            version: version + 1,
          },
        },
      });

      const approved = await tx.trip.findUniqueOrThrow({
        where: { id: current.id },
        include: tripInclude,
      });

      return this.toResponse(approved);
    });
  }

  async open(
    auth: AuthContext,
    id: string,
    version: number,
    requestId?: string,
  ) {
    this.ensureCarrier(auth);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.trip.findFirst({
        where: {
          id,
          carrierId: auth.userId,
        },
        include: tripInclude,
      });

      if (!current) {
        throw new NotFoundException({
          code: 'TRIP_NOT_FOUND',
          message: 'Ce voyage est introuvable.',
        });
      }

      if (current.status !== 'APPROVED') {
        throw new ConflictException({
          code: 'TRIP_NOT_APPROVED',
          message: 'Ce voyage doit être approuvé avant son ouverture.',
        });
      }

      if (current.version !== version) {
        throw new ConflictException({
          code: 'TRIP_VERSION_CONFLICT',
          message: 'Le voyage a été modifié. Actualisez avant de continuer.',
        });
      }

      await this.assertTripCanProgress(tx, current);

      const updated = await tx.trip.updateMany({
        where: {
          id: current.id,
          carrierId: auth.userId,
          status: 'APPROVED',
          version,
        },
        data: {
          status: 'OPEN',
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'TRIP_VERSION_CONFLICT',
          message: 'Le voyage a été modifié. Actualisez avant de continuer.',
        });
      }

      await tx.outboxEvent.create({
        data: {
          aggregate: 'trip',
          aggregateId: current.id,
          eventType: 'trip.opened',
          payload: {
            tripId: current.id,
            carrierId: auth.userId,
            corridorId: current.corridorId,
            flightNo: current.flightNo,
            departureAt: current.departureAt.toISOString(),
            availableKg: current.capacityKg.minus(current.reservedKg).toString(),
            version: version + 1,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          requestId: requestId ?? null,
          action: 'trip.open',
          entity: 'trip',
          entityId: current.id,
          metadata: {
            fromStatus: 'APPROVED',
            toStatus: 'OPEN',
            version: version + 1,
          },
        },
      });

      const opened = await tx.trip.findUniqueOrThrow({
        where: { id: current.id },
        include: tripInclude,
      });

      return this.toResponse(opened);
    });
  }

  private ensureCarrier(auth: AuthContext): void {
    if (auth.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'TRIP_ACCOUNT_NOT_ACTIVE',
        message: 'Votre compte doit être actif pour gérer des voyages.',
      });
    }

    if (!auth.roles.includes('CARRIER')) {
      throw new ForbiddenException({
        code: 'TRIP_CARRIER_ROLE_REQUIRED',
        message: 'Le rôle Voyageur vérifié est requis pour cette opération.',
      });
    }
  }

  private ensureOperator(auth: AuthContext): void {
    if (auth.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'TRIP_ACCOUNT_NOT_ACTIVE',
        message: 'Votre compte doit être actif pour gérer des voyages.',
      });
    }

    if (!auth.roles.some((role) => role === 'OPERATOR' || role === 'ADMIN')) {
      throw new ForbiddenException({
        code: 'TRIP_OPERATOR_ROLE_REQUIRED',
        message: 'Le rôle Opérateur est requis pour cette opération.',
      });
    }
  }

  private async assertTripCanProgress(
    db: TripValidationDb,
    trip: Pick<
      TripRecord,
      'corridorId' | 'departureAt' | 'capacityKg' | 'reservedKg'
    >,
  ): Promise<void> {
    this.assertFutureDeparture(trip.departureAt);
    await this.assertCorridorAvailable(db, trip.corridorId);

    if (trip.reservedKg.greaterThan(trip.capacityKg)) {
      throw new ConflictException({
        code: 'TRIP_CAPACITY_INCONSISTENT',
        message: 'La capacité disponible du voyage est incohérente.',
      });
    }
  }

  private async assertCorridorAvailable(
    db: TripValidationDb,
    corridorId: string,
  ): Promise<void> {
    const corridor = await db.corridor.findUnique({
      where: { id: corridorId },
      select: { id: true, isActive: true },
    });

    if (!corridor?.isActive) {
      throw new BadRequestException({
        code: 'TRIP_CORRIDOR_UNAVAILABLE',
        message: 'Ce trajet n’est pas disponible actuellement.',
      });
    }
  }

  private assertFutureDeparture(departureAt: Date): void {
    if (
      Number.isNaN(departureAt.getTime()) ||
      departureAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException({
        code: 'TRIP_DEPARTURE_NOT_FUTURE',
        message: 'La date de départ doit être dans le futur.',
      });
    }
  }

  private normalizeFlightNo(value: string): string {
    return value.trim().replace(/\s+/g, '').toUpperCase();
  }

  private toResponse(trip: TripRecord) {
    return {
      id: trip.id,
      status: trip.status,
      version: trip.version,
      flightNo: trip.flightNo,
      departureAt: trip.departureAt.toISOString(),
      capacityKg: trip.capacityKg.toString(),
      reservedKg: trip.reservedKg.toString(),
      availableKg: trip.capacityKg.minus(trip.reservedKg).toString(),
      createdAt: trip.createdAt.toISOString(),
      updatedAt: trip.updatedAt.toISOString(),
      corridor: {
        id: trip.corridor.id,
        originCountry: trip.corridor.originCountry,
        originCity: trip.corridor.originCity,
        destinationCountry: trip.corridor.destinationCountry,
        destinationCity: trip.corridor.destinationCity,
        currency: trip.corridor.currency,
      },
    };
  }
}
