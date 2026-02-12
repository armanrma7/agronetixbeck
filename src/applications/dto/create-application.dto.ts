import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, Max, MaxLength, IsDateString, IsNotEmpty, ValidateIf, IsUUID, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class CreateApplicationDto {
  @ApiProperty({
    description: 'Announcement ID to apply to',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4', { message: 'announcement_id must be a valid UUID' })
  @IsNotEmpty({ message: 'announcement_id is required' })
  announcement_id: string;

  @ApiProperty({
    description: 'Count/quantity (required if announcement category is goods). Use "count" not "quantity".',
    minimum: 1,
    example: 50,
  })
  @ValidateIf((o) => o.count !== undefined && o.count !== null)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'count must be a number' })
  @Min(0.01, { message: 'count must be greater than 0' })
  @Max(999999, { message: 'count cannot exceed 999999' })
  count?: number;

  @ApiProperty({
    description: 'Array of delivery dates (YYYY-MM-DD format). Required - can send multiple dates for daily deliveries. Cannot be in the past.',
    type: [String],
    example: ['2026-02-15', '2026-02-16', '2026-02-17'],
    minItems: 1,
  })
  @IsArray({ message: 'delivery_dates must be an array' })
  @ArrayMinSize(1, { message: 'At least one delivery date is required' })
  @ArrayMaxSize(365, { message: 'Cannot exceed 365 delivery dates' })
  @IsDateString({}, { each: true, message: 'Each delivery date must be a valid date in YYYY-MM-DD format' })
  delivery_dates: string[];

  @ApiPropertyOptional({
    description: 'Optional notes or comments',
    maxLength: 500,
    example: 'Please deliver in the morning',
  })
  @IsOptional()
  @IsString({ message: 'notes must be a string' })
  @MaxLength(500, { message: 'notes cannot exceed 500 characters' })
  notes?: string;
}

