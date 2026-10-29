import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthContext } from '../identity/types/auth-context';
import type { CreateShipmentDraftDto } from './dto/create-shipment-draft.dto';
import type { SubmitShipmentDto } from './dto/submit-shipment.dto';

const shipmentInclude = {
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
  parcels: {
    orderBy: { id: 'asc' as const },
    include: {
      category: {
        select: {
          id: true,
          code: true,
          label: true,
          isAllowed: true,
          constraints: true,
        },
      },
    },
  },
} satisfies Prisma.ShipmentInclude;

type ShipmentRecord = Prisma.ShipmentGetPayload<{
  include: typeof shipmentInclude;
}>;

type ShipmentValidationDb = Pick<
  Prisma.TransactionClient,
  'corridor' | 'parcelCategory'
>;

type ShipmentReferenceDb = Pick<Prisma.TransactionClient, 'shipment'>;

@Injectable()
export class ShipmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async options(auth: AuthContext) {
    this.ensureClient(auth);

    const [corridors, categories] = await Promise.all([
      this.prisma.corridor.findMany({
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
      }),
      this.prisma.parcelCategory.findMany({
        where: { isAllowed: true },
        orderBy: [{ label: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          label: true,
          constraints: true,
        },
      }),
    ]);

    return { corridors, categories };
  }

  async listMine(auth: AuthContext) {
    this.ensureClient(auth);

    const shipments = await this.prisma.shipment.findMany({
      where: { clientId: auth.userId },
      include: shipmentInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return shipments.map((shipment) => this.toResponse(shipment));
  }

  async getMine(auth: AuthContext, id: string) {
    this.ensureClient(auth);

    const shipment = await this.prisma.shipment.findFirst({
      where: { id, clientId: auth.userId },
      include: shipmentInclude,
    });

    if (!shipment) {
      throw new NotFoundException({
        code: 'SHIPMENT_NOT_FOUND',
        message: 'Ce colis est introuvable.',
      });
    }

    return this.toResponse(shipment);
  }

  async createDraft(
    auth: AuthContext,
    input: CreateShipmentDraftDto,
    requestId?: string,
  ) {
    this.ensureClient(auth);

    return this.prisma.$transaction(async (tx) => {
      await this.assertOptionsAvailable(
        tx,
        input.corridorId,
        input.parcels.map((parcel) => parcel.categoryId),
      );

      const publicRef = await this.createPublicRef(tx);

      const shipment = await tx.shipment.create({
        data: {
          publicRef,
          clientId: auth.userId,
          corridorId: input.corridorId,
          declaredValue: input.declaredValue,
          parcels: {
            create: input.parcels.map((parcel) => ({
              categoryId: parcel.categoryId,
              description: parcel.description.trim(),
              declaredWeight: parcel.declaredWeight,
            })),
          },
        },
        include: shipmentInclude,
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          requestId: requestId ?? null,
          action: 'shipment.draft.create',
          entity: 'shipment',
          entityId: shipment.id,
          metadata: {
            publicRef: shipment.publicRef,
            parcelCount: shipment.parcels.length,
          },
        },
      });

      return this.toResponse(shipment);
    });
  }

  async submit(
    auth: AuthContext,
    id: string,
    input: SubmitShipmentDto,
    requestId?: string,
  ) {
    this.ensureClient(auth);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.shipment.findFirst({
        where: { id, clientId: auth.userId },
        include: shipmentInclude,
      });

      if (!current) {
        throw new NotFoundException({
          code: 'SHIPMENT_NOT_FOUND',
          message: 'Ce colis est introuvable.',
        });
      }

      if (current.status !== 'DRAFT') {
        throw new ConflictException({
          code: 'SHIPMENT_NOT_DRAFT',
          message: 'Ce colis a déjà quitté l’état brouillon.',
        });
      }

      if (current.version !== input.version) {
        throw new ConflictException({
          code: 'SHIPMENT_VERSION_CONFLICT',
          message: 'Le colis a été modifié. Actualisez avant de continuer.',
        });
      }

      await this.assertOptionsAvailable(
        tx,
        current.corridorId,
        current.parcels.map((parcel) => parcel.categoryId),
      );

      const updated = await tx.shipment.updateMany({
        where: {
          id: current.id,
          clientId: auth.userId,
          status: 'DRAFT',
          version: input.version,
        },
        data: {
          status: 'SUBMITTED',
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException({
          code: 'SHIPMENT_VERSION_CONFLICT',
          message: 'Le colis a été modifié. Actualisez avant de continuer.',
        });
      }

      await tx.outboxEvent.create({
        data: {
          aggregate: 'shipment',
          aggregateId: current.id,
          eventType: 'shipment.submitted',
          payload: {
            shipmentId: current.id,
            publicRef: current.publicRef,
            clientId: auth.userId,
            corridorId: current.corridorId,
            version: input.version + 1,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          requestId: requestId ?? null,
          action: 'shipment.submit',
          entity: 'shipment',
          entityId: current.id,
          metadata: {
            publicRef: current.publicRef,
            fromStatus: 'DRAFT',
            toStatus: 'SUBMITTED',
            version: input.version + 1,
          },
        },
      });

      const submitted = await tx.shipment.findUniqueOrThrow({
        where: { id: current.id },
        include: shipmentInclude,
      });

      return this.toResponse(submitted);
    });
  }

  private ensureClient(auth: AuthContext): void {
    if (auth.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'SHIPMENT_ACCOUNT_NOT_ACTIVE',
        message: 'Votre compte doit être actif pour gérer des colis.',
      });
    }

    if (!auth.roles.includes('CLIENT')) {
      throw new ForbiddenException({
        code: 'SHIPMENT_CLIENT_ROLE_REQUIRED',
        message: 'Le rôle Client est requis pour cette opération.',
      });
    }
  }

  private async assertOptionsAvailable(
    db: ShipmentValidationDb,
    corridorId: string,
    categoryIds: string[],
  ): Promise<void> {
    const corridor = await db.corridor.findUnique({
      where: { id: corridorId },
      select: { id: true, isActive: true },
    });

    if (!corridor?.isActive) {
      throw new BadRequestException({
        code: 'SHIPMENT_CORRIDOR_UNAVAILABLE',
        message: 'Ce trajet n’est pas disponible actuellement.',
      });
    }

    const uniqueCategoryIds = [...new Set(categoryIds)];
    const categories = await db.parcelCategory.findMany({
      where: { id: { in: uniqueCategoryIds } },
      select: { id: true, isAllowed: true },
    });

    if (
      categories.length !== uniqueCategoryIds.length ||
      categories.some((category) => !category.isAllowed)
    ) {
      throw new BadRequestException({
        code: 'SHIPMENT_CATEGORY_UNAVAILABLE',
        message: 'Une catégorie de colis sélectionnée n’est pas autorisée.',
      });
    }
  }

  private async createPublicRef(db: ShipmentReferenceDb): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const publicRef = `FL-${randomBytes(6).toString('hex').toUpperCase()}`;
      const existing = await db.shipment.findUnique({
        where: { publicRef },
        select: { id: true },
      });

      if (!existing) return publicRef;
    }

    throw new InternalServerErrorException({
      code: 'SHIPMENT_REFERENCE_GENERATION_FAILED',
      message: 'Impossible de créer la référence du colis.',
    });
  }

  private toResponse(shipment: ShipmentRecord) {
    return {
      id: shipment.id,
      publicRef: shipment.publicRef,
      status: shipment.status,
      version: shipment.version,
      declaredValue: shipment.declaredValue?.toString() ?? null,
      currentCustodianId: shipment.currentCustodianId,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString(),
      corridor: {
        id: shipment.corridor.id,
        originCountry: shipment.corridor.originCountry,
        originCity: shipment.corridor.originCity,
        destinationCountry: shipment.corridor.destinationCountry,
        destinationCity: shipment.corridor.destinationCity,
        currency: shipment.corridor.currency,
      },
      parcels: shipment.parcels.map((parcel) => ({
        id: parcel.id,
        description: parcel.description,
        declaredWeight: parcel.declaredWeight.toString(),
        actualWeight: parcel.actualWeight?.toString() ?? null,
        sealNo: parcel.sealNo,
        category: {
          id: parcel.category.id,
          code: parcel.category.code,
          label: parcel.category.label,
          constraints: parcel.category.constraints,
        },
      })),
    };
  }
}
