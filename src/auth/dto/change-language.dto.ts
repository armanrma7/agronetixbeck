import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class ChangeLanguageDto {
  @ApiProperty({
    description: 'Bot language code',
    example: 'hy',
  })
  @IsString()
  @MaxLength(10)
  language: string;
}
