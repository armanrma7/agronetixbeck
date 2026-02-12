import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsUUID,
  Min,
  Max,
  MaxLength,
  ValidateIf,
  IsDateString,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import {
  AnnouncementType,
  AnnouncementCategory,
  Unit,
} from '../../entities/announcement.entity';

export class CreateAnnouncementDto {
  @ApiProperty({ enum: AnnouncementType, example: AnnouncementType.SELL })
  @IsEnum(AnnouncementType, {
    message: 'Type must be either sell or rent.',
  })
  type: AnnouncementType;

  @ApiProperty({ enum: AnnouncementCategory, example: AnnouncementCategory.GOODS })
  @IsEnum(AnnouncementCategory, {
    message: 'Category must be goods, rent, or service.',
  })
  category: AnnouncementCategory;

  @ApiProperty({ description: 'Foreign key to catalog_categories', example: 'uuid' })
  @IsUUID('4', { message: 'group_id must be a valid UUID.' })
  group_id: string;

  @ApiProperty({ description: 'Foreign key to catalog_items', example: 'uuid' })
  @IsUUID('4', { message: 'item_id must be a valid UUID.' })
  item_id: string;

  @ApiProperty({ minimum: 0, example: 1500.00 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Price must be >= 0.' })
  price: number;

  @ApiProperty({ required: false, maxLength: 2000, example: 'High quality wheat' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // ====================================
  // CONDITIONAL FIELDS (category-specific)
  // ====================================

  // For category = 'goods': count is required
  @ApiProperty({ 
    required: false,
    description: 'Required for goods category',
    minimum: 0.01, 
    maximum: 999999, 
    example: 1000 
  })
  @ValidateIf((o) => o.category === AnnouncementCategory.GOODS)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Count must be > 0 for goods.' })
  @Max(999999)
  count?: number;

  // For category = 'goods': daily_limit is optional
  @ApiProperty({ 
    required: false,
    description: 'Optional daily limit (must be <= count if provided)',
    minimum: 0.01, 
    example: 100 
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'Daily limit must be > 0.' })
  daily_limit?: number;

  // Unit is optional for all categories
  @ApiProperty({ enum: Unit, required: false, example: Unit.KG })
  @IsOptional()
  @IsEnum(Unit, {
    message: 'Select a valid measurement unit.',
  })
  unit?: Unit;

  // Images optional for all categories (max 3)
  @ApiProperty({ 
    type: [String], 
    required: false,
    description: 'Optional image file paths (max 3). For uploads, use multipart/form-data with binary files.',
    example: ['announcements/abc123/1.jpg', 'announcements/abc123/2.jpg'],
    maxItems: 3,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3, { message: 'Maximum 3 images allowed.' })
  images?: string[];

  // For category = 'rent': date_from is required
  @ApiProperty({ 
    required: false,
    description: 'Required for rent category (format: YYYY-MM-DD)',
    example: '2026-02-01' 
  })
  @ValidateIf((o) => o.category === AnnouncementCategory.RENT)
  @IsDateString({}, { message: 'date_from must be a valid date (YYYY-MM-DD).' })
  date_from?: string;

  // For category = 'rent': date_to is required
  @ApiProperty({ 
    required: false,
    description: 'Required for rent category (must be after date_from, format: YYYY-MM-DD)',
    example: '2026-02-28' 
  })
  @ValidateIf((o) => o.category === AnnouncementCategory.RENT)
  @IsDateString({}, { message: 'date_to must be a valid date (YYYY-MM-DD).' })
  date_to?: string;

  // min_area is optional (typically for rent category)
  @ApiProperty({ required: false, minimum: 0.01, example: 50.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'min_area must be > 0.' })
  min_area?: number;

  // ====================================
  // LOCATION FIELDS
  // ====================================

  @ApiProperty({ 
    type: [String], 
    required: false,
    description: 'Optional regions',
    example: ['uuid1', 'uuid2']
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each region must be a valid UUID.' })
  regions?: string[];

  @ApiProperty({ type: [String], required: false, example: ['uuid1', 'uuid2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each village must be a valid UUID.' })
  villages?: string[];
}
