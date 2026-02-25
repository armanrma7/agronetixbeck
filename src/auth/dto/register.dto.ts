import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsPhoneNumber,
  IsEmail,
  IsArray,
  IsBoolean,
  MinLength,
  IsOptional,
  ArrayMinSize,
  IsUUID,
} from 'class-validator';
import { UserType } from '../../entities/user.entity';

export class RegisterDto {
  @ApiProperty({
    description: 'Account type: farmer, company, or admin',
    enum: UserType,
    example: UserType.FARMER,
  })
  @IsEnum(UserType)
  user_type: UserType;

  @ApiProperty({
    description: 'Full name of the user or company name',
    example: 'John Doe',
  })
  @IsString()
  @MinLength(2)
  full_name: string;

  @ApiProperty({
    description: 'Primary phone number (must be unique)',
    example: '+1234567890',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({
    description: 'Password (minimum 8 characters)',
    example: 'SecurePass123!',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    description: 'Additional phone numbers',
    type: [String],
    required: false,
    example: ['+1234567891', '+1234567892'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsPhoneNumber(undefined, { each: true })
  phones?: string[];

  @ApiProperty({
    description: 'Email addresses',
    type: [String],
    required: false,
    example: ['john@example.com'],
  })
  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  @ArrayMinSize(0)
  emails?: string[];

  @ApiProperty({
    description: 'Profile picture URL or path',
    example: 'https://example.com/profile.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  profile_picture?: string;

  @ApiProperty({
    description: 'Region ID (UUID from regions table)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  region_id?: string;

  @ApiProperty({
    description: 'Village ID (UUID from villages table)',
    example: '123e4567-e89b-12d3-a456-426614174001',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  village_id?: string;

  @ApiProperty({
    description: 'Terms and conditions acceptance (defaults to true if not provided)',
    example: true,
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  terms_accepted?: boolean;
}
