import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User, UserType } from '../../entities/user.entity';

@Injectable()
export class CanCreateAnnouncementGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!user.verified) {
      throw new ForbiddenException(
        'You cannot create a new Announcement as your account is not verified'
      );
    }

    if (user.is_locked || user.account_status === 'blocked') {
      throw new ForbiddenException('Your account is blocked or deactivated');
    }

    if (user.user_type !== UserType.FARMER && user.user_type !== UserType.COMPANY) {
      throw new ForbiddenException('Only Farmers and Companies can create announcements');
    }

    return true;
  }
}

