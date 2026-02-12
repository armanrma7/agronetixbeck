import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * Optional JWT Auth Guard
 * Does not throw error if token is missing or invalid
 * Sets req.user if token is valid, otherwise leaves it undefined
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Try to activate, but don't throw if it fails
    return super.canActivate(context) as Promise<boolean>;
  }

  handleRequest(err: any, user: any, info: any) {
    // Don't throw error if authentication fails
    // Return user if authenticated, undefined otherwise
    return user || undefined;
  }
}

