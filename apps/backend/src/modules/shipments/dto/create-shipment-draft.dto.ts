import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';

export class ShipmentParcelDraftDto {
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @IsString()
  @Length(2, 500)
  description!: string;

  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  declaredWeight!: number;
}

export class CreateShipmentDraftDto {
  @IsString()
  @IsNotEmpty()
  corridorId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(0)
  declaredValue?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ShipmentParcelDraftDto)
  parcels!: ShipmentParcelDraftDto[];
}
