import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SubmitShipmentDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
