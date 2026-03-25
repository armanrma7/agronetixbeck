import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User, UserType } from '../../entities/user.entity';

@Injectable()
export class IsAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user || user.user_type !== UserType.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
