import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @ApiPropertyOptional({ maxLength: 255, example: 'Question about my account' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;

  @ApiProperty({ example: 'Hello, I have a problem with my announcement.' })
  @IsString()
  @MaxLength(5000)
  body: string;
}
