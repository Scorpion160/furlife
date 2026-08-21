import { IsString, Matches } from 'class-validator';

export class StartPhoneVerificationDto {
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;
}
