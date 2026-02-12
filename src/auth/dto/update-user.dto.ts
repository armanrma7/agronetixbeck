import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsUUID,
  MinLength,
  IsEmail,
  IsPhoneNumber,
} from 'class-validator';

export class UpdateUserDto {
  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  full_name?: string;

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
}

