import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber, IsBoolean, IsOptional, IsString, IsEnum } from 'class-validator';
import { AccountStatus } from '../../entities/user.entity';

export class VerifyCompanyDto {
  @ApiProperty({
    description: 'Phone number of the company to verify',
    example: '+1234567890',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    description: 'Verification status (true to verify, false to reject)',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  @ApiProperty({
    description: 'Account status: pending, active, or blocked',
    enum: AccountStatus,
    example: AccountStatus.ACTIVE,
    required: false,
  })
  @IsOptional()
  @IsEnum(AccountStatus)
  account_status?: AccountStatus;

  @ApiProperty({
    description: 'Admin reason for verification decision',
    example: 'Company documents verified',
    required: false,
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

