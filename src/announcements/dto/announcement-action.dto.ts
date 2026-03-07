import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AnnouncementAction } from '../../common/enums/announcement-action.enum';

export class AnnouncementActionDto {
  @ApiProperty({
    enum: AnnouncementAction,
    enumName: 'AnnouncementAction',
    description: 'The action to perform on the announcement.',
    example: AnnouncementAction.VERIFY,
  })
  @IsEnum(AnnouncementAction)
  action: AnnouncementAction;
}
