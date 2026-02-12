import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Phone number',
    example: '+1234567890',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    description: 'Password',
    example: 'SecurePass123!',
  })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiProperty({
    description: 'FCM (Firebase Cloud Messaging) token for push notifications',
    example: 'fcm_token_here',
    required: false,
  })
  @IsOptional()
  @IsString()
  fcm_token?: string;

  @ApiProperty({
    description: 'Device ID (unique device identifier)',
    example: 'device-uuid-123',
    required: false,
  })
  @IsOptional()
  @IsString()
  device_id?: string;

  @ApiProperty({
    description: 'Device type (ios, android, web)',
    example: 'ios',
    required: false,
  })
  @IsOptional()
  @IsString()
  device_type?: string;

  @ApiProperty({
    description: 'Device model',
    example: 'iPhone 13',
    required: false,
  })
  @IsOptional()
  @IsString()
  device_model?: string;

  @ApiProperty({
    description: 'OS version',
    example: 'iOS 15.0',
    required: false,
  })
  @IsOptional()
  @IsString()
  os_version?: string;

  @ApiProperty({
    description: 'App version',
    example: '1.0.0',
    required: false,
  })
  @IsOptional()
  @IsString()
  app_version?: string;
}

