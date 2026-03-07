import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ApplicationAction } from '../../common/enums/application-action.enum';

export class ApplicationActionDto {
  @ApiProperty({
    enum: ApplicationAction,
    enumName: 'ApplicationAction',
    description: 'The action to perform on the application.',
    example: ApplicationAction.APPROVE,
  })
  @IsEnum(ApplicationAction)
  action: ApplicationAction;
}
