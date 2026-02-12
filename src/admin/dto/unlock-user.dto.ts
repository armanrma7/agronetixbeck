import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsBoolean, IsOptional, IsString } from 'class-validator';

export class UnlockUserDto {
  @ApiProperty({
    description: 'Phone number of the user to unlock',
    example: '+1234567890',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    description: 'Unlock status (true to unlock, false to lock)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  unlock?: boolean;

  @ApiProperty({
    description: 'Admin reason for unlock/lock action',
    example: 'Account recovery completed',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

