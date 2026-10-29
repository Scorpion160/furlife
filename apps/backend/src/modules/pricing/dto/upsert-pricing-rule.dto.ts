import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Matches,
  Min,
} from 'class-validator';

const moneyPattern = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/;

export class UpsertPricingRuleDto {
  @Matches(moneyPattern)
  baseFee!: string;

  @Matches(moneyPattern)
  pricePerKg!: string;

  @Matches(moneyPattern)
  minimumFee!: string;

  @IsBoolean()
  isActive!: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version?: number;
}
