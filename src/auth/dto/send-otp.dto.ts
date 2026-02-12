import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsEnum, IsOptional, IsString } from 'class-validator';
import { OtpChannel } from '../../entities/otp-code.entity';

export class SendOtpDto {
  @ApiProperty({
    description: 'Phone number to send OTP to',
    example: '+1234567890',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    description: 'OTP delivery channel',
    enum: OtpChannel,
    default: OtpChannel.SMS,
    required: false,
  })
  @IsOptional()
  @IsEnum(OtpChannel)
  channel?: OtpChannel;

  @ApiProperty({
    description: 'Purpose of OTP (registration, forgot_password, etc.)',
    example: 'registration',
    required: false,
  })
  @IsOptional()
  @IsString()
  purpose?: string;
}

