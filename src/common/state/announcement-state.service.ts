import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AnnouncementAction } from '../enums/announcement-action.enum';
import { AnnouncementStatus } from '../enums/announcement-status.enum';
import { ApplicationStatus } from '../enums/application-status.enum';
import { UserRole } from '../enums/user-role.enum';
import { AnnouncementPermissionContext } from '../types/permission-context.types';

// ─── Internal types ────────────────────────────────────────────────────────────

interface AnnouncementTransition {
  /** Target status after this action. */
  to: AnnouncementStatus;
  /** Roles allowed to trigger this action. */
  allowedRoles: ReadonlySet<UserRole>;
  /** Optional condition that must be true for the transition to proceed. */
  guard?: (ctx: AnnouncementPermissionContext) => boolean;
  /** Human-readable message returned when guard fails. */
  guardMessage?: string;
}

/**
 * Cascading side-effect: maps each old ApplicationStatus to the new ApplicationStatus
 * it should be set to when the announcement transitions.
 * Only statuses that CHANGE are listed; omitted statuses remain unchanged.
 */
type ApplicationStatusCascade = ReadonlyMap<ApplicationStatus, ApplicationStatus>;

// ─── State machine definition ──────────────────────────────────────────────────

type TransitionMap = Partial<
  Record<AnnouncementStatus, Partial<Record<AnnouncementAction, AnnouncementTransition>>>
>;

const TRANSITIONS: TransitionMap = {
  // ── TO_BE_VERIFIED ──────────────────────────────────────────────────────────
  [AnnouncementStatus.TO_BE_VERIFIED]: {
    [AnnouncementAction.CANCEL]: {
      to: AnnouncementStatus.CANCELED,
      allowedRoles: new Set([UserRole.ANNOUNCER]),
    },
    [AnnouncementAction.VERIFY]: {
      to: AnnouncementStatus.ACTIVE,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
    [AnnouncementAction.BLOCK]: {
      to: AnnouncementStatus.BLOCKED,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },

  // ── ACTIVE ──────────────────────────────────────────────────────────────────
  [AnnouncementStatus.ACTIVE]: {
    [AnnouncementAction.CANCEL]: {
      to: AnnouncementStatus.CANCELED,
      allowedRoles: new Set([UserRole.ANNOUNCER]),
    },
    [AnnouncementAction.CLOSE]: {
      to: AnnouncementStatus.CLOSED,
      allowedRoles: new Set([UserRole.ANNOUNCER]),
      guard: (ctx) => ctx.hasApprovedApplication,
      guardMessage:
        'Announcement can only be closed when at least one application is approved.',
    },
    [AnnouncementAction.BLOCK]: {
      to: AnnouncementStatus.BLOCKED,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
    // VERIFY on ACTIVE = admin re-confirms; no status change, validated by calling code
    [AnnouncementAction.VERIFY]: {
      to: AnnouncementStatus.ACTIVE,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },

  // ── CLOSED ──────────────────────────────────────────────────────────────────
  [AnnouncementStatus.CLOSED]: {
    [AnnouncementAction.VERIFY]: {
      to: AnnouncementStatus.ACTIVE,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
    [AnnouncementAction.BLOCK]: {
      to: AnnouncementStatus.BLOCKED,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
    [AnnouncementAction.DEACTIVATE]: {
      to: AnnouncementStatus.ACTIVE,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },

  // ── CANCELED ────────────────────────────────────────────────────────────────
  [AnnouncementStatus.CANCELED]: {
    [AnnouncementAction.DEACTIVATE]: {
      to: AnnouncementStatus.ACTIVE,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },

  // ── BLOCKED ─────────────────────────────────────────────────────────────────
  [AnnouncementStatus.BLOCKED]: {
    [AnnouncementAction.DEACTIVATE]: {
      to: AnnouncementStatus.ACTIVE,
      allowedRoles: new Set([UserRole.ADMIN]),
    },
  },
};

// ─── Side-effect cascades ──────────────────────────────────────────────────────

/**
 * Defines which application statuses must change when the announcement moves
 * from one status to another. Key format: `FROM→TO`.
 */
const APPLICATION_CASCADES: Record<string, ApplicationStatusCascade> = {
  // ACTIVE → CLOSED: only PENDING applications become CANCELED
  [`${AnnouncementStatus.ACTIVE}→${AnnouncementStatus.CLOSED}`]: new Map([
    [ApplicationStatus.PENDING, ApplicationStatus.CANCELED],
  ]),
  // ACTIVE → CANCELED: PENDING and APPROVED applications become CANCELED
  [`${AnnouncementStatus.ACTIVE}→${AnnouncementStatus.CANCELED}`]: new Map([
    [ApplicationStatus.PENDING, ApplicationStatus.CANCELED],
    [ApplicationStatus.APPROVED, ApplicationStatus.CANCELED],
  ]),
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AnnouncementStateService {
  /**
   * Validates the action against the current context and returns the target status.
   *
   * @throws BadRequestException – action is not defined for the current status
   * @throws ForbiddenException  – caller's role is not allowed
   * @throws BadRequestException – guard condition not satisfied
   */
  resolveTransition(
    action: AnnouncementAction,
    ctx: AnnouncementPermissionContext,
  ): AnnouncementStatus {
    const statusTransitions = TRANSITIONS[ctx.announcementStatus];

    if (!statusTransitions) {
      throw new BadRequestException(
        `No transitions defined for announcement status "${ctx.announcementStatus}".`,
      );
    }

    const transition = statusTransitions[action];
    if (!transition) {
      throw new BadRequestException(
        `Action "${action}" is not allowed when announcement status is "${ctx.announcementStatus}".`,
      );
    }

    if (!transition.allowedRoles.has(ctx.userRole)) {
      throw new ForbiddenException(
        `Role "${ctx.userRole}" cannot perform action "${action}" on status "${ctx.announcementStatus}".`,
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
   * Returns the cascade map for application status updates when an announcement
   * moves from `from` to `to`.
   *
   * If a given ApplicationStatus is NOT a key in the returned map, it stays unchanged.
   */
  getApplicationCascade(
    from: AnnouncementStatus,
    to: AnnouncementStatus,
  ): ApplicationStatusCascade {
    return APPLICATION_CASCADES[`${from}→${to}`] ?? new Map();
  }

  /**
   * Applies a cascade to a list of current application statuses and returns
   * a map of { applicationId → newStatus } for those that must change.
   */
  buildCascadeUpdates(
    applications: ReadonlyArray<{ id: string; status: ApplicationStatus }>,
    cascade: ApplicationStatusCascade,
  ): Map<string, ApplicationStatus> {
    const updates = new Map<string, ApplicationStatus>();

    for (const app of applications) {
      const newStatus = cascade.get(app.status);
      if (newStatus !== undefined) {
        updates.set(app.id, newStatus);
      }
    }

    return updates;
  }
}
