import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateTripDraftDto {
  @IsString()
  @IsNotEmpty()
  corridorId!: string;

  @IsString()
  @Length(2, 12)
  @Matches(/^[A-Za-z0-9 -]+$/)
  flightNo!: string;

  @IsDateString()
  departureAt!: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.1)
  @Max(100)
  capacityKg!: number;
}
