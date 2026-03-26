import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AccountStatus, UserType } from '../../entities/user.entity';

/**
 * Restricts non-ACTIVE (PENDING / BLOCKED) accounts:
 *   - GET requests  → always allowed (read-only browsing)
 *   - POST / PATCH / PUT / DELETE → blocked unless account is ACTIVE or ADMIN
 *
 * Inactive users may still:
 *   - Browse any GET endpoint
 *   - Update their own profile  (PUT /auth/users/:id — guard not applied there)
 *   - View their own profile    (GET /auth/me)
 *
 * If req.user is not set (public / unauthenticated route), the guard passes
 * and lets JwtAuthGuard handle authentication enforcement.
 */
@Injectable()
export class ActiveAccountGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Public / unauthenticated route – not our concern here.
    if (!user) return true;

    // Admins bypass the active-account check entirely.
    if (user.user_type === UserType.ADMIN) return true;

    // ACTIVE accounts can do everything.
    if (user.account_status === AccountStatus.ACTIVE) return true;

    // Inactive accounts may still perform read-only (GET) requests.
    if (request.method === 'GET') return true;

    throw new ForbiddenException(
      'Your account is not active. You can only view data or update your profile.',
    );
  }
}
