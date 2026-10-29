import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class SubmitTripDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
