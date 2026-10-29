import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AuthContext } from '../identity/types/auth-context';
import type { UpsertPricingRuleDto } from './dto/upsert-pricing-rule.dto';

const pricingRuleInclude = {
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
} satisfies Prisma.PricingRuleInclude;

type PricingRuleRecord = Prisma.PricingRuleGetPayload<{
  include: typeof pricingRuleInclude;
}>;

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async listRules(auth: AuthContext) {
    this.ensureOperator(auth);

    const rules = await this.prisma.pricingRule.findMany({
      include: pricingRuleInclude,
      orderBy: [
        { corridor: { originCountry: 'asc' } },
        { corridor: { originCity: 'asc' } },
        { corridor: { destinationCountry: 'asc' } },
        { corridor: { destinationCity: 'asc' } },
      ],
    });

    return rules.map((rule) => this.ruleResponse(rule));
  }

  async upsertRule(
    auth: AuthContext,
    corridorId: string,
    input: UpsertPricingRuleDto,
    requestId?: string,
  ) {
    this.ensureOperator(auth);

    return this.prisma.$transaction(async (tx) => {
      const corridor = await tx.corridor.findUnique({
        where: { id: corridorId },
        select: {
          id: true,
          originCountry: true,
          originCity: true,
          destinationCountry: true,
          destinationCity: true,
          currency: true,
        },
      });

      if (!corridor) {
        throw new NotFoundException({
          code: 'PRICING_CORRIDOR_NOT_FOUND',
          message: 'Ce corridor est introuvable.',
        });
      }

      const existing = await tx.pricingRule.findUnique({
        where: { corridorId },
      });

      const values = {
        baseFee: new Prisma.Decimal(input.baseFee),
        pricePerKg: new Prisma.Decimal(input.pricePerKg),
        minimumFee: new Prisma.Decimal(input.minimumFee),
        isActive: input.isActive,
      };

      if (!existing) {
        if (input.version !== undefined) {
          throw this.versionConflict();
        }

        const created = await tx.pricingRule.create({
          data: {
            corridorId,
            ...values,
          },
          include: pricingRuleInclude,
        });

        await tx.auditLog.create({
          data: {
            actorId: auth.userId,
            requestId: requestId ?? null,
            action: 'pricing.rule.create',
            entity: 'pricing_rule',
            entityId: created.id,
            metadata: {
              corridorId,
              currency: corridor.currency,
              baseFee: created.baseFee.toString(),
              pricePerKg: created.pricePerKg.toString(),
              minimumFee: created.minimumFee.toString(),
              isActive: created.isActive,
              version: created.version,
            },
          },
        });

        return this.ruleResponse(created);
      }

      if (input.version !== existing.version) {
        throw this.versionConflict();
      }

      const updated = await tx.pricingRule.updateMany({
        where: {
          id: existing.id,
          version: input.version,
        },
        data: {
          ...values,
          version: { increment: 1 },
        },
      });

      if (updated.count !== 1) {
        throw this.versionConflict();
      }

      const refreshed = await tx.pricingRule.findUniqueOrThrow({
        where: { id: existing.id },
        include: pricingRuleInclude,
      });

      await tx.auditLog.create({
        data: {
          actorId: auth.userId,
          requestId: requestId ?? null,
          action: 'pricing.rule.update',
          entity: 'pricing_rule',
          entityId: refreshed.id,
          metadata: {
            corridorId,
            currency: corridor.currency,
            baseFee: refreshed.baseFee.toString(),
            pricePerKg: refreshed.pricePerKg.toString(),
            minimumFee: refreshed.minimumFee.toString(),
            isActive: refreshed.isActive,
            version: refreshed.version,
          },
        },
      });

      return this.ruleResponse(refreshed);
    });
  }

  async quote(
    auth: AuthContext,
    shipmentId: string,
    requestId?: string,
  ) {
    this.ensureClient(auth);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const shipment = await tx.shipment.findFirst({
          where: {
            id: shipmentId,
            clientId: auth.userId,
          },
          include: {
            parcels: {
              select: { declaredWeight: true },
            },
            corridor: {
              select: {
                id: true,
                currency: true,
              },
            },
          },
        });

        if (!shipment) {
          throw new NotFoundException({
            code: 'SHIPMENT_NOT_FOUND',
            message: 'Ce colis est introuvable.',
          });
        }

        if (shipment.status !== 'MATCHED') {
          throw new ConflictException({
            code: 'PRICING_SHIPMENT_NOT_MATCHED',
            message: 'Le colis doit être associé à un voyage avant le calcul du prix.',
          });
        }

        const acceptedMatch = await tx.match.findFirst({
          where: {
            shipmentId,
            status: 'ACCEPTED',
          },
          select: { id: true },
        });

        if (!acceptedMatch) {
          throw new ConflictException({
            code: 'PRICING_ACCEPTED_MATCH_NOT_FOUND',
            message: 'Aucun match accepté n’est disponible pour ce colis.',
          });
        }

        const existing = await tx.pricingQuote.findUnique({
          where: { matchId: acceptedMatch.id },
        });

        if (existing) {
          return this.quoteResponse(existing);
        }

        const rule = await tx.pricingRule.findUnique({
          where: { corridorId: shipment.corridorId },
        });

        if (!rule?.isActive) {
          throw new ConflictException({
            code: 'PRICING_RULE_UNAVAILABLE',
            message: 'Aucun tarif actif n’est disponible pour ce corridor.',
          });
        }

        const weightKg = shipment.parcels.reduce(
          (total, parcel) => total.plus(parcel.declaredWeight),
          new Prisma.Decimal(0),
        );

        if (weightKg.lessThanOrEqualTo(0)) {
          throw new ConflictException({
            code: 'PRICING_WEIGHT_INVALID',
            message: 'Le poids déclaré du colis est invalide.',
          });
        }

        const variableFee = rule.pricePerKg
          .times(weightKg)
          .toDecimalPlaces(2);
        const subtotal = rule.baseFee.plus(variableFee).toDecimalPlaces(2);
        const totalAmount = subtotal.greaterThan(rule.minimumFee)
          ? subtotal
          : rule.minimumFee;

        const created = await tx.pricingQuote.create({
          data: {
            shipmentId,
            matchId: acceptedMatch.id,
            pricingRuleId: rule.id,
            currency: shipment.corridor.currency,
            weightKg,
            baseFee: rule.baseFee,
            variableFee,
            totalAmount,
            ruleVersion: rule.version,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: auth.userId,
            requestId: requestId ?? null,
            action: 'pricing.quote.create',
            entity: 'pricing_quote',
            entityId: created.id,
            metadata: {
              shipmentId,
              matchId: acceptedMatch.id,
              pricingRuleId: rule.id,
              ruleVersion: rule.version,
              currency: created.currency,
              weightKg: created.weightKg.toString(),
              baseFee: created.baseFee.toString(),
              variableFee: created.variableFee.toString(),
              totalAmount: created.totalAmount.toString(),
            },
          },
        });

        return this.quoteResponse(created);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.pricingQuote.findFirst({
          where: {
            shipmentId,
            shipment: {
              clientId: auth.userId,
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) return this.quoteResponse(existing);
      }

      throw error;
    }
  }

  private ensureOperator(auth: AuthContext): void {
    if (
      auth.status !== 'ACTIVE' ||
      !auth.roles.some((role) => role === 'OPERATOR' || role === 'ADMIN')
    ) {
      throw new ForbiddenException({
        code: 'PRICING_OPERATOR_ROLE_REQUIRED',
        message: 'Le rôle Opérateur est requis pour gérer les tarifs.',
      });
    }
  }

  private ensureClient(auth: AuthContext): void {
    if (auth.status !== 'ACTIVE' || !auth.roles.includes('CLIENT')) {
      throw new ForbiddenException({
        code: 'PRICING_CLIENT_ROLE_REQUIRED',
        message: 'Le rôle Client est requis pour calculer le prix.',
      });
    }
  }

  private versionConflict(): ConflictException {
    return new ConflictException({
      code: 'PRICING_RULE_VERSION_CONFLICT',
      message: 'Le tarif a été modifié. Actualisez avant de continuer.',
    });
  }

  private ruleResponse(rule: PricingRuleRecord) {
    return {
      id: rule.id,
      corridorId: rule.corridorId,
      baseFee: rule.baseFee.toString(),
      pricePerKg: rule.pricePerKg.toString(),
      minimumFee: rule.minimumFee.toString(),
      currency: rule.corridor.currency,
      isActive: rule.isActive,
      version: rule.version,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      corridor: {
        id: rule.corridor.id,
        originCountry: rule.corridor.originCountry,
        originCity: rule.corridor.originCity,
        destinationCountry: rule.corridor.destinationCountry,
        destinationCity: rule.corridor.destinationCity,
      },
    };
  }

  private quoteResponse(quote: {
    id: string;
    shipmentId: string;
    matchId: string;
    pricingRuleId: string;
    currency: string;
    weightKg: Prisma.Decimal;
    baseFee: Prisma.Decimal;
    variableFee: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    ruleVersion: number;
    createdAt: Date;
  }) {
    return {
      id: quote.id,
      shipmentId: quote.shipmentId,
      matchId: quote.matchId,
      pricingRuleId: quote.pricingRuleId,
      currency: quote.currency,
      weightKg: quote.weightKg.toString(),
      baseFee: quote.baseFee.toString(),
      variableFee: quote.variableFee.toString(),
      totalAmount: quote.totalAmount.toString(),
      ruleVersion: quote.ruleVersion,
      createdAt: quote.createdAt.toISOString(),
    };
  }
}
