import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
  IsDateString,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';

export class UpdateApplicationDto {
  @ApiPropertyOptional({
    description: 'Count/quantity (for goods announcements)',
    minimum: 0.01,
    example: 50,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'count must be a number' })
  @Min(0.01, { message: 'count must be greater than 0' })
  @Max(999999, { message: 'count cannot exceed 999999' })
  count?: number;

  @ApiPropertyOptional({
    description:
      'Delivery dates (YYYY-MM-DD). Required length ≥1 only when the announcement has date_from or date_to; otherwise may be omitted or [].',
    type: [String],
    example: ['2026-02-15', '2026-02-16'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(365, { message: 'Cannot exceed 365 delivery dates' })
  @IsDateString({}, { each: true, message: 'Each delivery date must be YYYY-MM-DD' })
  delivery_dates?: string[];

  @ApiPropertyOptional({
    description: 'Notes',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'notes cannot exceed 500 characters' })
  notes?: string;
}
