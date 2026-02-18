import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNotEmpty } from 'class-validator';

export class CreateFavoriteDto {
  @ApiProperty({
    description: 'ID of the announcement to favorite',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID('4', { message: 'announcement_id must be a valid UUID' })
  @IsNotEmpty({ message: 'announcement_id is required' })
  announcement_id: string;
}
