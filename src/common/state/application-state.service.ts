import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ApplicationAction } from '../enums/application-action.enum';
import { ApplicationStatus } from '../enums/application-status.enum';
import { AnnouncementStatus } from '../enums/announcement-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { ApplicationPermissionContext } from '../types/permission-context.types';

// ─── Internal types ────────────────────────────────────────────────────────────

interface ApplicationTransition {
  to: ApplicationStatus;
  allowedRoles: ReadonlySet<UserRole>;
  /** Additional runtime guard beyond role check. */
  guard?: (ctx: ApplicationPermissionContext) => boolean;
  guardMessage?: string;
  /** If provided, the announcement must be in one of these statuses. */
  requireAnnouncementStatus?: ReadonlySet<AnnouncementStatus>;
}

// ─── State machine definition ──────────────────────────────────────────────────

type ApplicationTransitionMap = Partial<
  Record<ApplicationStatus, Partial<Record<ApplicationAction, ApplicationTransition>>>
>;

const TRANSITIONS: ApplicationTransitionMap = {
  // ── PENDING ─────────────────────────────────────────────────────────────────
  [ApplicationStatus.PENDING]: {
    [ApplicationAction.APPROVE]: {
      to: ApplicationStatus.APPROVED,
      allowedRoles: new Set([UserRole.ANNOUNCER]),
      guard: (ctx) => ctx.isAnnouncementOwner,
      guardMessage: 'Only the announcement owner can approve an application.',
      requireAnnouncementStatus: new Set([AnnouncementStatus.ACTIVE]),
    },
    [ApplicationAction.REJECT]: {
      to: ApplicationStatus.REJECTED,
      allowedRoles: new Set([UserRole.ANNOUNCER]),
      guard: (ctx) => ctx.isAnnouncementOwner,
      guardMessage: 'Only the announcement owner can reject an application.',
      requireAnnouncementStatus: new Set([AnnouncementStatus.ACTIVE]),
    },
    [ApplicationAction.CANCEL]: {
      to: ApplicationStatus.CANCELED,
      allowedRoles: new Set([UserRole.APPLICANT]),
      guard: (ctx) => ctx.isApplicationOwner,
      guardMessage: 'You can only cancel your own application.',
    },
    [ApplicationAction.BLOCK]: {
      to: ApplicationStatus.BLOCKED,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },

  // ── APPROVED ────────────────────────────────────────────────────────────────
  [ApplicationStatus.APPROVED]: {
    [ApplicationAction.REJECT]: {
      to: ApplicationStatus.REJECTED,
      allowedRoles: new Set([UserRole.ANNOUNCER]),
      guard: (ctx) => ctx.isAnnouncementOwner,
      guardMessage: 'Only the announcement owner can reject an application.',
      requireAnnouncementStatus: new Set([AnnouncementStatus.ACTIVE]),
    },
    [ApplicationAction.CANCEL]: {
      to: ApplicationStatus.CANCELED,
      allowedRoles: new Set([UserRole.APPLICANT]),
      guard: (ctx) => ctx.isApplicationOwner,
      guardMessage: 'You can only cancel your own application.',
    },
    [ApplicationAction.BLOCK]: {
      to: ApplicationStatus.BLOCKED,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },

  // ── REJECTED ────────────────────────────────────────────────────────────────
  [ApplicationStatus.REJECTED]: {
    [ApplicationAction.BLOCK]: {
      to: ApplicationStatus.BLOCKED,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
    [ApplicationAction.DEACTIVATE]: {
      to: ApplicationStatus.PENDING,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },

  // ── CANCELED ────────────────────────────────────────────────────────────────
  [ApplicationStatus.CANCELED]: {
    [ApplicationAction.BLOCK]: {
      to: ApplicationStatus.BLOCKED,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
    [ApplicationAction.DEACTIVATE]: {
      to: ApplicationStatus.PENDING,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },

  // ── BLOCKED ─────────────────────────────────────────────────────────────────
  [ApplicationStatus.BLOCKED]: {
    [ApplicationAction.DEACTIVATE]: {
      to: ApplicationStatus.PENDING,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ApplicationStateService {
  /**
   * Validates the action against the current context and returns the target status.
   *
   * NOTE: APPLY_AGAIN creates a brand-new application; it does NOT call this method.
   * Handle it at the service layer by delegating to createApplication().
   *
   * @throws BadRequestException – action not defined for current status
   * @throws ForbiddenException  – caller's role is not allowed
   * @throws BadRequestException – guard condition not satisfied
   */
  resolveTransition(
    action: ApplicationAction,
    ctx: ApplicationPermissionContext,
  ): ApplicationStatus {
    const statusTransitions = TRANSITIONS[ctx.applicationStatus];

    if (!statusTransitions) {
      throw new BadRequestException(
        `No transitions defined for application status "${ctx.applicationStatus}".`,
      );
    }

    const transition = statusTransitions[action];
    if (!transition) {
      throw new BadRequestException(
        `Action "${action}" is not allowed when application status is "${ctx.applicationStatus}".`,
      );
    }

    if (!transition.allowedRoles.has(ctx.userRole)) {
      throw new ForbiddenException(
        `Role "${ctx.userRole}" cannot perform action "${action}" on application status "${ctx.applicationStatus}".`,
      );
    }

    if (
      transition.requireAnnouncementStatus &&
      !transition.requireAnnouncementStatus.has(ctx.announcementStatus)
    ) {
      throw new BadRequestException(
        `Action "${action}" requires announcement to be in status ` +
          `[${[...transition.requireAnnouncementStatus].join(', ')}], ` +
          `but it is currently "${ctx.announcementStatus}".`,
      );
    }

    if (transition.guard && !transition.guard(ctx)) {
      throw new BadRequestException(
        transition.guardMessage ?? `Condition not met for action "${action}".`,
      );
    }

    return transition.to;
  }

  /**
   * Returns whether APPLY_AGAIN is allowed based on application status, role, and context.
   * APPLY_AGAIN creates a NEW application, so it's a creation action, not a transition.
   */
  canApplyAgain(ctx: ApplicationPermissionContext): boolean {
    if (ctx.userRole !== UserRole.APPLICANT || !ctx.isApplicationOwner) return false;

    const allowed = new Set([
      ApplicationStatus.APPROVED,
      ApplicationStatus.REJECTED,
      ApplicationStatus.CANCELED,
    ]);

    return (
      allowed.has(ctx.applicationStatus) &&
      ctx.announcementStatus === AnnouncementStatus.ACTIVE
    );
  }
}
