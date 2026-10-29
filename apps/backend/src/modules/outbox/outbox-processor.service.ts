import { Injectable } from '@nestjs/common';
import { OutboxStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MatchingService } from '../matching/matching.service';
import { NotificationsService } from '../notifications/notifications.service';

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

@Injectable()
export class OutboxProcessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly matching: MatchingService,
  ) {}

  async processBatch(limit = 20): Promise<number> {
    const now = new Date();
    await this.recoverStaleLeases(now);

    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        status: {
          in: [OutboxStatus.PENDING, OutboxStatus.FAILED],
        },
        availableAt: {
          lte: now,
        },
      },
      orderBy: { createdAt: 'asc' },
      take: Math.max(1, Math.min(limit, 100)),
    });

    let processed = 0;

    for (const candidate of candidates) {
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          status: {
            in: [OutboxStatus.PENDING, OutboxStatus.FAILED],
          },
          availableAt: {
            lte: now,
          },
        },
        data: {
          status: OutboxStatus.PROCESSING,
          attempts: { increment: 1 },
          availableAt: new Date(now.getTime() + PROCESSING_LEASE_MS),
        },
      });

      if (claimed.count !== 1) continue;

      const attempt = candidate.attempts + 1;

      try {
        await this.dispatch(
          candidate.eventType,
          candidate.aggregateId,
          candidate.payload,
        );

        await this.prisma.outboxEvent.update({
          where: { id: candidate.id },
          data: {
            status: OutboxStatus.PUBLISHED,
            publishedAt: new Date(),
          },
        });
      } catch (error) {
        await this.fail(candidate.id, candidate.eventType, attempt, error);
      }

      processed += 1;
    }

    return processed;
  }

  private async dispatch(
    eventType: string,
    aggregateId: string,
    payload: Prisma.JsonValue,
  ): Promise<void> {
    if (eventType === 'shipment.submitted') {
      const data = this.asObject(payload);
      const clientId = this.requiredString(data, 'clientId');
      const publicRef = this.requiredString(data, 'publicRef');

      await this.notifications.createDeduplicated({
        userId: clientId,
        type: 'shipment_submitted',
        title: 'Colis soumis',
        body: `Votre colis ${publicRef} a été soumis avec succès.`,
        relatedType: 'shipment',
        relatedId: aggregateId,
        dedupeKey: `shipment_submitted:${aggregateId}:${clientId}`,
        payload: {
          shipmentId: aggregateId,
          status: 'SUBMITTED',
        },
      });

      await this.matching.onShipmentSubmitted(aggregateId);
      return;
    }

    if (eventType === 'trip.approved') {
      const data = this.asObject(payload);
      const carrierId = this.requiredString(data, 'carrierId');
      const flightNo = this.requiredString(data, 'flightNo');

      await this.notifications.createDeduplicated({
        userId: carrierId,
        type: 'trip_approved',
        title: 'Voyage approuvé',
        body: `Votre voyage ${flightNo} a été approuvé. Vous pouvez maintenant l’ouvrir aux colis.`,
        relatedType: 'trip',
        relatedId: aggregateId,
        dedupeKey: `trip_approved:${aggregateId}:${carrierId}`,
        payload: {
          tripId: aggregateId,
          status: 'APPROVED',
        },
      });
      return;
    }

    if (eventType === 'trip.opened') {
      await this.matching.onTripOpened(aggregateId);
      return;
    }

    if (eventType === 'shipment.matching.started') {
      const data = this.asObject(payload);
      const clientId = this.requiredString(data, 'clientId');
      const publicRef = this.requiredString(data, 'publicRef');

      await this.notifications.createDeduplicated({
        userId: clientId,
        type: 'shipment_matching_started',
        title: 'Voyage compatible trouvé',
        body: `Une proposition de voyage est disponible pour votre colis ${publicRef}.`,
        relatedType: 'shipment',
        relatedId: aggregateId,
        dedupeKey: `shipment_matching_started:${aggregateId}:${clientId}`,
        payload: {
          shipmentId: aggregateId,
          status: 'MATCHING',
        },
      });
      return;
    }

    if (eventType === 'match.accepted') {
      const data = this.asObject(payload);
      const clientId = this.requiredString(data, 'clientId');
      const carrierId = this.requiredString(data, 'carrierId');
      const shipmentId = this.requiredString(data, 'shipmentId');
      const publicRef = this.requiredString(data, 'publicRef');
      const tripId = this.requiredString(data, 'tripId');
      const flightNo = this.requiredString(data, 'flightNo');

      await this.notifications.createDeduplicated({
        userId: clientId,
        type: 'match_accepted',
        title: 'Voyage sélectionné',
        body: `Votre colis ${publicRef} est maintenant associé au voyage ${flightNo}.`,
        relatedType: 'shipment',
        relatedId: shipmentId,
        dedupeKey: `match_accepted:${aggregateId}:${clientId}`,
        payload: {
          matchId: aggregateId,
          shipmentId,
          tripId,
          status: 'MATCHED',
        },
      });

      await this.notifications.createDeduplicated({
        userId: carrierId,
        type: 'match_assigned',
        title: 'Colis associé à votre voyage',
        body: `Un colis a été associé à votre voyage ${flightNo}.`,
        relatedType: 'trip',
        relatedId: tripId,
        dedupeKey: `match_assigned:${aggregateId}:${carrierId}`,
        payload: {
          matchId: aggregateId,
          shipmentId,
          tripId,
          status: 'ACCEPTED',
        },
      });
    }
  }

  private async recoverStaleLeases(now: Date): Promise<void> {
    await this.prisma.outboxEvent.updateMany({
      where: {
        status: OutboxStatus.PROCESSING,
        availableAt: { lte: now },
      },
      data: {
        status: OutboxStatus.FAILED,
        availableAt: now,
      },
    });
  }

  private async fail(
    eventId: string,
    eventType: string,
    attempt: number,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error ? error.message.slice(0, 500) : 'Unknown failure';
    const backoffSeconds = Math.min(300, 5 * 2 ** Math.min(attempt - 1, 6));

    await this.prisma.$transaction([
      this.prisma.outboxEvent.update({
        where: { id: eventId },
        data: {
          status: OutboxStatus.FAILED,
          availableAt: new Date(Date.now() + backoffSeconds * 1000),
        },
      }),
      this.prisma.auditLog.create({
        data: {
          action: 'outbox.process.failed',
          entity: 'outbox_event',
          entityId: eventId,
          metadata: {
            eventType,
            attempt,
            error: message,
          },
        },
      }),
    ]);
  }

  private asObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Outbox payload must be an object');
    }

    return value as Record<string, Prisma.JsonValue>;
  }

  private requiredString(
    payload: Record<string, Prisma.JsonValue>,
    key: string,
  ): string {
    const value = payload[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Outbox payload is missing ${key}`);
    }

    return value;
  }
}
