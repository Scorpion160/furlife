import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthContext } from '../identity/types/auth-context';

const MAX_SCAN = 100;
const MAX_PROPOSALS_PER_SHIPMENT = 20;
const ELIGIBLE_SCORE = 100;

const matchInclude = {
  trip: {
    include: {
      corridor: {
        select: {
          id: true,
          originCountry: true,
          originCity: true,
          destinationCountry: true,
          destinationCity: true,
          currency: true,
        },
      },
    },
  },
} satisfies Prisma.MatchInclude;

type MatchRecord = Prisma.MatchGetPayload<{
  include: typeof matchInclude;
}>;

@Injectable()
export class MatchingService {
  constructor(private readonly prisma: PrismaService) {}

  async listForShipment(auth: AuthContext, shipmentId: string) {
    this.ensureClient(auth);

    const shipment = await this.prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        clientId: auth.userId,
      },
      select: { id: true },
    });

    if (!shipment) {
      throw new NotFoundException({
        code: 'SHIPMENT_NOT_FOUND',
        message: 'Ce colis est introuvable.',
      });
    }

    const matches = await this.prisma.match.findMany({
      where: { shipmentId },
      include: matchInclude,
      orderBy: [
        { status: 'asc' },
        { score: 'desc' },
        { createdAt: 'asc' },
      ],
      take: MAX_PROPOSALS_PER_SHIPMENT,
    });

    return matches.map((match) => this.toResponse(match));
  }

  async onShipmentSubmitted(shipmentId: string): Promise<number> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        parcels: {
          select: { declaredWeight: true },
        },
      },
    });

    if (
      !shipment ||
      (shipment.status !== 'SUBMITTED' && shipment.status !== 'MATCHING')
    ) {
      return 0;
    }

    const weight = this.shipmentWeight(shipment.parcels);
    const now = new Date();

    const trips = await this.prisma.trip.findMany({
      where: {
        corridorId: shipment.corridorId,
        status: 'OPEN',
        departureAt: { gt: now },
      },
      orderBy: { departureAt: 'asc' },
      take: MAX_SCAN,
    });

    let created = 0;

    for (const trip of trips) {
      if (created >= MAX_PROPOSALS_PER_SHIPMENT) break;
      if (!this.canCarry(trip.capacityKg, trip.reservedKg, weight)) continue;

      if (await this.createProposalIfMissing(shipment.id, trip.id)) {
        created += 1;
      }
    }

    await this.ensureShipmentMatchingState(
      shipment.id,
      shipment.clientId,
      shipment.publicRef,
    );

    return created;
  }

  async onTripOpened(tripId: string): Promise<number> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
    });

    if (
      !trip ||
      trip.status !== 'OPEN' ||
      trip.departureAt.getTime() <= Date.now()
    ) {
      return 0;
    }

    const shipments = await this.prisma.shipment.findMany({
      where: {
        corridorId: trip.corridorId,
        status: { in: ['SUBMITTED', 'MATCHING'] },
      },
      include: {
        parcels: {
          select: { declaredWeight: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_SCAN,
    });

    let created = 0;

    for (const shipment of shipments) {
      const weight = this.shipmentWeight(shipment.parcels);
      if (!this.canCarry(trip.capacityKg, trip.reservedKg, weight)) continue;

      if (await this.createProposalIfMissing(shipment.id, trip.id)) {
        created += 1;
      }

      await this.ensureShipmentMatchingState(
        shipment.id,
        shipment.clientId,
        shipment.publicRef,
      );
    }

    return created;
  }

  private async createProposalIfMissing(
    shipmentId: string,
    tripId: string,
  ): Promise<boolean> {
    try {
      await this.prisma.match.create({
        data: {
          shipmentId,
          tripId,
          score: ELIGIBLE_SCORE,
          status: 'PROPOSED',
        },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  private async ensureShipmentMatchingState(
    shipmentId: string,
    clientId: string,
    publicRef: string,
  ): Promise<void> {
    const proposedCount = await this.prisma.match.count({
      where: {
        shipmentId,
        status: 'PROPOSED',
      },
    });

    if (proposedCount === 0) return;

    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.shipment.updateMany({
        where: {
          id: shipmentId,
          status: 'SUBMITTED',
        },
        data: {
          status: 'MATCHING',
          version: { increment: 1 },
        },
      });

      if (transitioned.count !== 1) return;

      await tx.auditLog.create({
        data: {
          action: 'shipment.matching.start',
          entity: 'shipment',
          entityId: shipmentId,
          metadata: {
            proposedCount,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          aggregate: 'shipment',
          aggregateId: shipmentId,
          eventType: 'shipment.matching.started',
          payload: {
            shipmentId,
            clientId,
            publicRef,
            proposedCount,
          },
        },
      });
    });
  }

  private shipmentWeight(
    parcels: Array<{ declaredWeight: Prisma.Decimal }>,
  ): Prisma.Decimal {
    return parcels.reduce(
      (total, parcel) => total.plus(parcel.declaredWeight),
      new Prisma.Decimal(0),
    );
  }

  private canCarry(
    capacityKg: Prisma.Decimal,
    reservedKg: Prisma.Decimal,
    shipmentWeight: Prisma.Decimal,
  ): boolean {
    return capacityKg.minus(reservedKg).greaterThanOrEqualTo(shipmentWeight);
  }

  private ensureClient(auth: AuthContext): void {
    if (auth.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'MATCHING_ACCOUNT_NOT_ACTIVE',
        message: 'Votre compte doit être actif pour consulter les propositions.',
      });
    }

    if (!auth.roles.includes('CLIENT')) {
      throw new ForbiddenException({
        code: 'MATCHING_CLIENT_ROLE_REQUIRED',
        message: 'Le rôle Client est requis pour cette opération.',
      });
    }
  }

  private toResponse(match: MatchRecord) {
    return {
      id: match.id,
      status: match.status,
      score: match.score,
      createdAt: match.createdAt.toISOString(),
      updatedAt: match.updatedAt.toISOString(),
      trip: {
        id: match.trip.id,
        flightNo: match.trip.flightNo,
        departureAt: match.trip.departureAt.toISOString(),
        capacityKg: match.trip.capacityKg.toString(),
        reservedKg: match.trip.reservedKg.toString(),
        availableKg: match.trip.capacityKg
          .minus(match.trip.reservedKg)
          .toString(),
        corridor: {
          id: match.trip.corridor.id,
          originCountry: match.trip.corridor.originCountry,
          originCity: match.trip.corridor.originCity,
          destinationCountry: match.trip.corridor.destinationCountry,
          destinationCity: match.trip.corridor.destinationCity,
          currency: match.trip.corridor.currency,
        },
      },
    };
  }
}
