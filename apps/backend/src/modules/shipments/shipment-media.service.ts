import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import type { AuthContext } from '../identity/types/auth-context';
import type { ConfirmMediaUploadDto } from './dto/confirm-media-upload.dto';
import type { CreateMediaUploadDto } from './dto/create-media-upload.dto';
import { ObjectStorageService } from './object-storage.service';

const MAX_MEDIA_PER_SHIPMENT = 12;
const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024;

const extensionByContentType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class ShipmentMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async list(auth: AuthContext, shipmentId: string) {
    this.ensureClient(auth);
    await this.requireOwnedShipment(auth, shipmentId);

    const media = await this.prisma.mediaAsset.findMany({
      where: {
        shipmentId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    return media.map((item) => this.toResponse(item));
  }

  async createUploadIntent(
    auth: AuthContext,
    shipmentId: string,
    input: CreateMediaUploadDto,
  ) {
    this.ensureClient(auth);
    const shipment = await this.requireOwnedShipment(auth, shipmentId);

    if (shipment.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'MEDIA_SHIPMENT_NOT_DRAFT',
        message: 'Les photos de déclaration ne peuvent être ajoutées qu’au brouillon.',
      });
    }

    const confirmedCount = await this.prisma.mediaAsset.count({
      where: { shipmentId, deletedAt: null },
    });

    if (confirmedCount >= MAX_MEDIA_PER_SHIPMENT) {
      throw new ConflictException({
        code: 'MEDIA_LIMIT_REACHED',
        message: 'Le nombre maximal de photos pour ce colis est atteint.',
      });
    }

    const extension = extensionByContentType[input.contentType];
    const objectKey =
      `shipments/${shipmentId}/declaration/${randomUUID()}.${extension}`;
    const upload = this.storage.createUploadIntent({
      objectKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });

    return {
      objectKey,
      purpose: input.purpose,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256.toLowerCase(),
      ...upload,
    };
  }

  async confirm(
    auth: AuthContext,
    shipmentId: string,
    input: ConfirmMediaUploadDto,
    requestId?: string,
  ) {
    this.ensureClient(auth);
    const shipment = await this.requireOwnedShipment(auth, shipmentId);
    const normalizedSha256 = input.sha256.toLowerCase();

    const existing = await this.prisma.mediaAsset.findUnique({
      where: { objectKey: input.objectKey },
    });
    if (existing) {
      if (
        existing.shipmentId === shipmentId &&
        existing.uploadedById === auth.userId &&
        existing.contentType === input.contentType &&
        existing.sizeBytes === BigInt(input.sizeBytes) &&
        existing.sha256 === normalizedSha256 &&
        existing.purpose === input.purpose &&
        existing.deletedAt === null
      ) {
        return this.toResponse(existing);
      }

      throw new ConflictException({
        code: 'MEDIA_OBJECT_ALREADY_CONFIRMED',
        message: 'Ce fichier a déjà été associé à une autre preuve.',
      });
    }

    if (shipment.status !== 'DRAFT') {
      throw new ConflictException({
        code: 'MEDIA_SHIPMENT_NOT_DRAFT',
        message: 'Les photos de déclaration ne peuvent être ajoutées qu’au brouillon.',
      });
    }

    const expectedPrefix = `shipments/${shipmentId}/declaration/`;
    if (!input.objectKey.startsWith(expectedPrefix)) {
      throw new BadRequestException({
        code: 'MEDIA_OBJECT_KEY_INVALID',
        message: 'La référence de stockage du fichier est invalide.',
      });
    }

    const confirmedCount = await this.prisma.mediaAsset.count({
      where: { shipmentId, deletedAt: null },
    });
    if (confirmedCount >= MAX_MEDIA_PER_SHIPMENT) {
      throw new ConflictException({
        code: 'MEDIA_LIMIT_REACHED',
        message: 'Le nombre maximal de photos pour ce colis est atteint.',
      });
    }

    const inspection = await this.storage.inspectImageObject(
      input.objectKey,
      MAX_MEDIA_SIZE_BYTES,
    );

    const mismatchCode =
      inspection.sizeBytes !== input.sizeBytes
        ? 'MEDIA_SIZE_MISMATCH'
        : inspection.sha256 !== normalizedSha256
          ? 'MEDIA_SHA256_MISMATCH'
          : inspection.detectedContentType !== input.contentType
            ? 'MEDIA_CONTENT_TYPE_MISMATCH'
            : null;

    if (mismatchCode) {
      await this.storage.deleteObjectBestEffort(input.objectKey);
      throw new BadRequestException({
        code: mismatchCode,
        message: 'Le fichier téléversé ne correspond pas à la déclaration.',
      });
    }

    try {
      const media = await this.prisma.$transaction(async (tx) => {
        const created = await tx.mediaAsset.create({
          data: {
            shipmentId,
            objectKey: input.objectKey,
            contentType: input.contentType,
            sizeBytes: BigInt(input.sizeBytes),
            sha256: normalizedSha256,
            purpose: input.purpose,
            uploadedById: auth.userId,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: auth.userId,
            requestId: requestId ?? null,
            action: 'shipment.media.confirm',
            entity: 'shipment',
            entityId: shipmentId,
            metadata: {
              mediaId: created.id,
              purpose: created.purpose,
              contentType: created.contentType,
              sizeBytes: created.sizeBytes.toString(),
              sha256: created.sha256,
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            aggregate: 'shipment',
            aggregateId: shipmentId,
            eventType: 'shipment.media.confirmed',
            payload: {
              shipmentId,
              mediaId: created.id,
              purpose: created.purpose,
            },
          },
        });

        return created;
      });

      return this.toResponse(media);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.prisma.mediaAsset.findUnique({
          where: { objectKey: input.objectKey },
        });
        if (
          concurrent &&
          concurrent.shipmentId === shipmentId &&
          concurrent.uploadedById === auth.userId &&
          concurrent.sha256 === normalizedSha256
        ) {
          return this.toResponse(concurrent);
        }
      }

      throw error;
    }
  }

  async download(auth: AuthContext, shipmentId: string, mediaId: string) {
    this.ensureClient(auth);

    const media = await this.prisma.mediaAsset.findFirst({
      where: {
        id: mediaId,
        shipmentId,
        deletedAt: null,
        shipment: {
          clientId: auth.userId,
        },
      },
    });

    if (!media) {
      throw new NotFoundException({
        code: 'MEDIA_NOT_FOUND',
        message: 'Cette preuve est introuvable.',
      });
    }

    return this.storage.createDownloadUrl(media.objectKey);
  }

  private ensureClient(auth: AuthContext): void {
    if (auth.status !== 'ACTIVE') {
      throw new ForbiddenException({
        code: 'MEDIA_ACCOUNT_NOT_ACTIVE',
        message: 'Votre compte doit être actif pour gérer des preuves.',
      });
    }

    if (!auth.roles.includes('CLIENT')) {
      throw new ForbiddenException({
        code: 'MEDIA_CLIENT_ROLE_REQUIRED',
        message: 'Le rôle Client est requis pour cette opération.',
      });
    }
  }

  private async requireOwnedShipment(auth: AuthContext, shipmentId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: {
        id: shipmentId,
        clientId: auth.userId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!shipment) {
      throw new NotFoundException({
        code: 'SHIPMENT_NOT_FOUND',
        message: 'Ce colis est introuvable.',
      });
    }

    return shipment;
  }

  private toResponse(media: {
    id: string;
    contentType: string;
    sizeBytes: bigint;
    sha256: string;
    purpose: string;
    createdAt: Date;
  }) {
    return {
      id: media.id,
      contentType: media.contentType,
      sizeBytes: media.sizeBytes.toString(),
      sha256: media.sha256,
      purpose: media.purpose,
      createdAt: media.createdAt.toISOString(),
    };
  }
}
