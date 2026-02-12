import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, Length, IsOptional } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Phone number that received the OTP',
    example: '+1234567890',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    description: '6-digit OTP code',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({
    description: 'Purpose of OTP verification',
    example: 'registration',
    required: false,
  })
  @IsOptional()
  @IsString()
  purpose?: string;
}

