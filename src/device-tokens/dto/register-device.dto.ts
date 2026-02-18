import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'FCM (Firebase Cloud Messaging) token for push notifications',
    example: 'fcm_token_here',
  })
  @IsString()
  @IsNotEmpty()
  fcm_token: string;

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
