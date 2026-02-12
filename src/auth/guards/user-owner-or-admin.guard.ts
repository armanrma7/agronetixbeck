import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User, UserType } from '../../entities/user.entity';

@Injectable()
export class UserOwnerOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: User = request.user;
    const userId = request.params.id;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admin can update any user
    if (user.user_type === UserType.ADMIN) {
      return true;
    }

    // User can only update themselves
    if (user.id !== userId) {
      throw new ForbiddenException('You can only update your own profile');
    }

    return true;
  }
}

