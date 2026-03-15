import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { UserType, AccountStatus } from '../../entities/user.entity';

export class AdminUpdateUserDto {
  @ApiPropertyOptional({ enum: UserType, description: 'Change user role/type' })
  @IsOptional()
  @IsEnum(UserType)
  user_type?: UserType;

  @ApiPropertyOptional({ enum: AccountStatus, description: 'Change account status' })
  @IsOptional()
  @IsEnum(AccountStatus)
  account_status?: AccountStatus;

  @ApiPropertyOptional({ description: 'Lock or unlock account' })
  @IsOptional()
  @IsBoolean()
  is_locked?: boolean;

  @ApiPropertyOptional({ description: 'Set verified status (e.g. verify/reject account)' })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

