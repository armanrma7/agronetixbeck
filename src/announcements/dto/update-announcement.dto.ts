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
  ArrayMaxSize,
} from 'class-validator';
import { AnnouncementType, AnnouncementCategory, AnnouncementStatus } from '../../entities/announcement.entity';

export class UpdateAnnouncementDto {
  @ApiProperty({ enum: AnnouncementType, required: false })
  @IsOptional()
  @IsEnum(AnnouncementType, { message: 'Type must be either sell or rent.' })
  type?: AnnouncementType;

  @ApiProperty({ enum: AnnouncementCategory, required: false })
  @IsOptional()
  @IsEnum(AnnouncementCategory, { message: 'Category must be goods, rent, or service.' })
  category?: AnnouncementCategory;

  @ApiProperty({ required: false, description: 'Foreign key to catalog_categories' })
  @IsOptional()
  @IsUUID('4', { message: 'group_id must be a valid UUID.' })
  group_id?: string;

  @ApiProperty({ required: false, description: 'Foreign key to catalog_items' })
  @IsOptional()
  @IsUUID('4', { message: 'item_id must be a valid UUID.' })
  item_id?: string;

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

  @ApiProperty({ required: false, description: 'Value must exist in DB enum unit_enum.' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3, { message: 'Maximum 3 images allowed.' })
  images?: string[];

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

  @ApiProperty({ required: false, description: 'Optional. Value must exist in DB enum rent_unit_enum.' })
  @IsOptional()
  @IsString()
  rent_unit?: string;

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

  @ApiProperty({ 
    required: false, 
    description: 'Expiry date when announcement should be automatically closed (format: YYYY-MM-DD)',
    example: '2026-12-31' 
  })
  @IsOptional()
  @IsDateString({}, { message: 'expiry_date must be a valid date (YYYY-MM-DD).' })
  expiry_date?: string;

  @ApiProperty({ 
    enum: AnnouncementStatus, 
    required: false,
    description: 'Status cannot be updated via this endpoint. Use dedicated endpoints: /publish, /block, /close, /cancel',
    deprecated: true,
  })
  @IsOptional()
  @IsEnum(AnnouncementStatus, {
    message: `Status cannot be updated via this endpoint. Use: /publish, /block, /close, /cancel`,
  })
  status?: AnnouncementStatus;
}
