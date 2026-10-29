import { IsString, Length } from 'class-validator';
import { CreateMediaUploadDto } from './create-media-upload.dto';

export class ConfirmMediaUploadDto extends CreateMediaUploadDto {
  @IsString()
  @Length(20, 512)
  objectKey!: string;
}
