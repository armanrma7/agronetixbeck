import {
  Injectable,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AccountStatus, UserType } from '../../entities/user.entity';

/**
 * Combines JwtAuthGuard + ActiveAccountGuard in a single pass.
 *
 * Use this instead of bare JwtAuthGuard on routes where inactive (PENDING)
 * accounts must be blocked from mutating data.
 *
 * Rules (after JWT validation):
 *   - ADMIN          → always allowed
 *   - ACTIVE account → always allowed
 *   - PENDING + GET  → allowed (read-only browse)
 *   - PENDING + POST / PATCH / PUT / DELETE → 403
 */
@Injectable()
export class JwtActiveGuard extends JwtAuthGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Step 1: run standard JWT validation (sets req.user or throws 401)
    await super.canActivate(context);

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) return true;
    if (user.user_type === UserType.ADMIN) return true;
    if (user.account_status === AccountStatus.ACTIVE) return true;
    if (request.method === 'GET') return true;

    throw new ForbiddenException(
      'Your account is not active. You can only view data or update your profile.',
    );
  }
}
