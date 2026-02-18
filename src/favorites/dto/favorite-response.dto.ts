import { ApiProperty } from '@nestjs/swagger';

export class FavoriteResponseDto {
  @ApiProperty({
    description: 'Favorite ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Announcement ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  announcement_id: string;

  @ApiProperty({
    description: 'User ID who favorited',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  user_id: string;

  @ApiProperty({
    description: 'Timestamp when favorited',
    example: '2024-01-01T00:00:00.000Z',
  })
  created_at: Date;

  @ApiProperty({
    description: 'The favorited announcement (only published announcements)',
    type: 'object',
  })
  announcement?: any;
}
