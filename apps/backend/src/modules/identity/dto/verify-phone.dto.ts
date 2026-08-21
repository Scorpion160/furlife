import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class VerifyPhoneDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  challengeId!: string;

  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/)
  phoneE164!: string;

  @IsString()
  @Matches(/^\d{6}$/)
  code!: string;
}
