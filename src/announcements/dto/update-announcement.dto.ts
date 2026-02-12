import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsUUID,
  Min,
  Max,
  MaxLength,
  IsEnum,
  IsDateString,
  ArrayMinSize,
} from 'class-validator';
import { Unit, AnnouncementStatus } from '../../entities/announcement.entity';

export class UpdateAnnouncementDto {
  @ApiProperty({ required: false, minimum: 0, example: 1500.00 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Price must be >= 0.' })
  price?: number;

  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // For goods category
  @ApiProperty({ required: false, minimum: 0.01, maximum: 999999 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Count must be > 0.' })
  @Max(999999)
  count?: number;

  @ApiProperty({ required: false, minimum: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Daily limit must be > 0.' })
  daily_limit?: number;

  @ApiProperty({ enum: Unit, required: false })
  @IsOptional()
  @IsEnum(Unit, {
    message: 'Select a valid measurement unit.',
  })
  unit?: Unit;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  // For rent category
  @ApiProperty({ required: false, example: '2026-02-01' })
  @IsOptional()
  @IsDateString({}, { message: 'date_from must be a valid date (YYYY-MM-DD).' })
  date_from?: string;

  @ApiProperty({ required: false, example: '2026-02-28' })
  @IsOptional()
  @IsDateString({}, { message: 'date_to must be a valid date (YYYY-MM-DD).' })
  date_to?: string;

  @ApiProperty({ required: false, minimum: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'min_area must be > 0.' })
  min_area?: number;

  // Location
  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each region must be a valid UUID.' })
  regions?: string[];

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each village must be a valid UUID.' })
  villages?: string[];

  // Status should not be updatable via this endpoint
  // Status changes should use dedicated endpoints (publish, block, close, cancel)
  // But we validate it here to provide a clear error message if someone tries
  @ApiProperty({ 
    enum: AnnouncementStatus, 
    required: false,
    description: 'Status cannot be updated via this endpoint. Use dedicated endpoints: /publish, /block, /close, /cancel',
    deprecated: true,
  })
  @IsOptional()
  @IsEnum(AnnouncementStatus, {
    message: `Status must be one of: ${Object.values(AnnouncementStatus).join(', ')}. Status cannot be updated via this endpoint.`,
  })
  status?: AnnouncementStatus;
}
