import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AnnouncementsService } from '../announcements.service';

@Injectable()
export class AnnouncementOwnerGuard implements CanActivate {
  constructor(private announcementsService: AnnouncementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const announcementId = request.params.id;
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    const announcement = await this.announcementsService.findOne(announcementId);

    if (announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only access your own announcements');
    }

    return true;
  }
}

