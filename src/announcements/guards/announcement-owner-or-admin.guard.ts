import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AnnouncementsService } from '../announcements.service';
import { UserType } from '../../entities/user.entity';

@Injectable()
export class AnnouncementOwnerOrAdminGuard implements CanActivate {
  constructor(private announcementsService: AnnouncementsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const announcementId = request.params.id;
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admins can access all announcements
    if (user.user_type === UserType.ADMIN) {
      return true;
    }

    // Regular users can only access their own announcements
    const announcement = await this.announcementsService.findOne(announcementId);

    if (announcement.owner_id !== user.id) {
      throw new ForbiddenException('You can only access your own announcements');
    }

    return true;
  }
}

