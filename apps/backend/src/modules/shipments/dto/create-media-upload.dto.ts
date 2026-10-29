import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  Matches,
} from 'class-validator';

export const shipmentMediaContentTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const shipmentMediaPurposes = ['DECLARATION_PHOTO'] as const;

export class CreateMediaUploadDto {
  @IsIn([...shipmentMediaContentTypes])
  contentType!: (typeof shipmentMediaContentTypes)[number];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  sha256!: string;

  @IsIn([...shipmentMediaPurposes])
  purpose!: (typeof shipmentMediaPurposes)[number];
}
