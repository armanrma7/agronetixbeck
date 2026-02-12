import { ApiProperty } from '@nestjs/swagger';
import { IsPhoneNumber } from 'class-validator';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Phone number associated with the account',
    example: '+1234567890',
  })
  @IsPhoneNumber()
  phone: string;
}

