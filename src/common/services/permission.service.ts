import { ForbiddenException, Injectable } from '@nestjs/common';
import { AnnouncementAction } from '../enums/announcement-action.enum';
import { ApplicationAction } from '../enums/application-action.enum';
import { AnnouncementStatus } from '../enums/announcement-status.enum';
import { ApplicationStatus } from '../enums/application-status.enum';
import { UserRole } from '../enums/user-role.enum';
import {
  AnnouncementPermissionContext,
  ApplicationPermissionContext,
} from '../types/permission-context.types';

// ─── Rule types ────────────────────────────────────────────────────────────────

type AnnouncementPermissionEvaluator = (
  ctx: AnnouncementPermissionContext,
) => ReadonlySet<AnnouncementAction>;

type ApplicationPermissionEvaluator = (
  ctx: ApplicationPermissionContext,
) => ReadonlySet<ApplicationAction>;

// ─── Announcement permission map ───────────────────────────────────────────────
//
//  Structure:  Status → Role → (context) => Set<Action>
//
//  IMPORTANT: "isOwner" for announcements means the user IS the announcer.
//  APPLY/CLOSE/VIEW eligibility depend on runtime conditions captured in the context.

const ANNOUNCEMENT_PERMISSIONS: Record<
  AnnouncementStatus,
  Partial<Record<UserRole, AnnouncementPermissionEvaluator>>
> = {
  // ── TO_BE_VERIFIED ───────────────────────────────────────────────────────────
  [AnnouncementStatus.TO_BE_VERIFIED]: {
    [UserRole.ANNOUNCER]: () =>
      new Set([AnnouncementAction.VIEW, AnnouncementAction.CANCEL]),

    [UserRole.APPLICANT]: () => new Set<AnnouncementAction>(),

    [UserRole.ADMIN]: () =>
      new Set([
        AnnouncementAction.VIEW,
        AnnouncementAction.VERIFY,
        AnnouncementAction.BLOCK,
      ]),
  },

  // ── ACTIVE ───────────────────────────────────────────────────────────────────
  [AnnouncementStatus.ACTIVE]: {
    [UserRole.ANNOUNCER]: (ctx) => {
      const actions = new Set<AnnouncementAction>([
        AnnouncementAction.VIEW,
        AnnouncementAction.CANCEL,
      ]);
      // CLOSE is only available when there is at least one approved application (Case 2c)
      if (ctx.hasApprovedApplication) {
        actions.add(AnnouncementAction.CLOSE);
      }
      return actions;
    },

    [UserRole.APPLICANT]: (ctx) => {
      const actions = new Set<AnnouncementAction>([AnnouncementAction.VIEW]);

      // APPLY is blocked when an approved application already exists (Case 2c)
      // or when the user already has their own PENDING application (Case 2b)
      if (!ctx.hasApprovedApplication && !ctx.hasOwnPendingApplication) {
        actions.add(AnnouncementAction.APPLY);
      }

      return actions;
    },

    [UserRole.ADMIN]: () =>
      new Set([
        AnnouncementAction.VIEW,
        AnnouncementAction.VERIFY,
        AnnouncementAction.BLOCK,
      ]),
  },

  // ── CLOSED ───────────────────────────────────────────────────────────────────
  [AnnouncementStatus.CLOSED]: {
    [UserRole.ANNOUNCER]: () => new Set([AnnouncementAction.VIEW]),

    // Applicants can only VIEW if they previously applied
    [UserRole.APPLICANT]: (ctx) =>
      ctx.hasApplied
        ? new Set([AnnouncementAction.VIEW])
        : new Set<AnnouncementAction>(),

    [UserRole.ADMIN]: () =>
      new Set([
        AnnouncementAction.VIEW,
        AnnouncementAction.VERIFY,
        AnnouncementAction.BLOCK,
        AnnouncementAction.DEACTIVATE,
      ]),
  },

  // ── CANCELED ─────────────────────────────────────────────────────────────────
  [AnnouncementStatus.CANCELED]: {
    [UserRole.ANNOUNCER]: () => new Set([AnnouncementAction.VIEW]),

    [UserRole.APPLICANT]: (ctx) =>
      ctx.hasApplied
        ? new Set([AnnouncementAction.VIEW])
        : new Set<AnnouncementAction>(),

    [UserRole.ADMIN]: () =>
      new Set([AnnouncementAction.VIEW, AnnouncementAction.DEACTIVATE]),
  },

  // ── BLOCKED ──────────────────────────────────────────────────────────────────
  [AnnouncementStatus.BLOCKED]: {
    [UserRole.ANNOUNCER]: () => new Set([AnnouncementAction.VIEW]),

    [UserRole.APPLICANT]: () => new Set<AnnouncementAction>(),

    [UserRole.ADMIN]: () =>
      new Set([AnnouncementAction.VIEW, AnnouncementAction.DEACTIVATE]),
  },
};

// ─── Application permission map ────────────────────────────────────────────────
//
//  Context differentiates:
//    isApplicationOwner  – the applicant who submitted this specific application
//    isAnnouncementOwner – the announcer who owns the parent announcement

const APPLICATION_PERMISSIONS: Record<
  ApplicationStatus,
  Partial<Record<UserRole, ApplicationPermissionEvaluator>>
> = {
  // ── PENDING ──────────────────────────────────────────────────────────────────
  [ApplicationStatus.PENDING]: {
    [UserRole.ANNOUNCER]: (ctx) =>
      ctx.isAnnouncementOwner
        ? new Set([
            ApplicationAction.VIEW,
            ApplicationAction.REJECT,
            ApplicationAction.APPROVE,
          ])
        : new Set<ApplicationAction>(),

    [UserRole.APPLICANT]: (ctx) =>
      ctx.isApplicationOwner
        ? new Set([
            ApplicationAction.VIEW,
            ApplicationAction.CANCEL,
            ApplicationAction.EDIT,
          ])
        : new Set<ApplicationAction>(),

    [UserRole.ADMIN]: () =>
      new Set([ApplicationAction.VIEW, ApplicationAction.BLOCK]),
  },

  // ── APPROVED ─────────────────────────────────────────────────────────────────
  [ApplicationStatus.APPROVED]: {
    [UserRole.ANNOUNCER]: (ctx) =>
      ctx.isAnnouncementOwner
        ? new Set([ApplicationAction.VIEW, ApplicationAction.REJECT])
        : new Set<ApplicationAction>(),

    [UserRole.APPLICANT]: (ctx) =>
      ctx.isApplicationOwner
        ? new Set([
            ApplicationAction.VIEW,
            ApplicationAction.CANCEL,
            ApplicationAction.APPLY_AGAIN,
          ])
        : new Set<ApplicationAction>(),

    [UserRole.ADMIN]: () =>
      new Set([ApplicationAction.VIEW, ApplicationAction.BLOCK]),
  },

  // ── REJECTED ─────────────────────────────────────────────────────────────────
  [ApplicationStatus.REJECTED]: {
    [UserRole.ANNOUNCER]: (ctx) =>
      ctx.isAnnouncementOwner
        ? new Set([ApplicationAction.VIEW])
        : new Set<ApplicationAction>(),

    [UserRole.APPLICANT]: (ctx) =>
      ctx.isApplicationOwner
        ? new Set([ApplicationAction.VIEW, ApplicationAction.APPLY_AGAIN])
        : new Set<ApplicationAction>(),

    [UserRole.ADMIN]: () =>
      new Set([
        ApplicationAction.VIEW,
        ApplicationAction.BLOCK,
        ApplicationAction.DEACTIVATE,
      ]),
  },

  // ── CANCELED ─────────────────────────────────────────────────────────────────
  [ApplicationStatus.CANCELED]: {
    [UserRole.ANNOUNCER]: (ctx) =>
      ctx.isAnnouncementOwner
        ? new Set([ApplicationAction.VIEW])
        : new Set<ApplicationAction>(),

    // Owner can APPLY_AGAIN but no longer VIEW the canceled application
    [UserRole.APPLICANT]: (ctx) =>
      ctx.isApplicationOwner
        ? new Set([ApplicationAction.APPLY_AGAIN])
        : new Set<ApplicationAction>(),

    [UserRole.ADMIN]: () =>
      new Set([
        ApplicationAction.VIEW,
        ApplicationAction.DEACTIVATE,
        ApplicationAction.BLOCK,
      ]),
  },

  // ── BLOCKED ──────────────────────────────────────────────────────────────────
  [ApplicationStatus.BLOCKED]: {
    [UserRole.ANNOUNCER]: () => new Set<ApplicationAction>(),

    [UserRole.APPLICANT]: (ctx) =>
      ctx.isApplicationOwner
        ? new Set([ApplicationAction.VIEW])
        : new Set<ApplicationAction>(),

    [UserRole.ADMIN]: () =>
      new Set([ApplicationAction.VIEW, ApplicationAction.DEACTIVATE]),
  },
};

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class PermissionService {
  // ── Announcement ─────────────────────────────────────────────────────────────

  /**
   * Returns the full set of actions available to the user in this context.
   * Empty set means the user has no access at all.
   */
  getAllowedAnnouncementActions(
    ctx: AnnouncementPermissionContext,
  ): ReadonlySet<AnnouncementAction> {
    const evaluator =
      ANNOUNCEMENT_PERMISSIONS[ctx.announcementStatus]?.[ctx.userRole];

    return evaluator ? evaluator(ctx) : new Set<AnnouncementAction>();
  }

  /** Returns true when the user is allowed to perform the given action. */
  canPerformAnnouncementAction(
    action: AnnouncementAction,
    ctx: AnnouncementPermissionContext,
  ): boolean {
    return this.getAllowedAnnouncementActions(ctx).has(action);
  }

  /**
   * Throws ForbiddenException if the user cannot perform the action.
   * Use this as a guard at the top of every mutating service method.
   */
  assertAnnouncementAction(
    action: AnnouncementAction,
    ctx: AnnouncementPermissionContext,
  ): void {
    if (!this.canPerformAnnouncementAction(action, ctx)) {
      throw new ForbiddenException(
        `Action "${action}" is not permitted for role "${ctx.userRole}" ` +
          `on announcement status "${ctx.announcementStatus}".`,
      );
    }
  }

  // ── Application ──────────────────────────────────────────────────────────────

  getAllowedApplicationActions(
    ctx: ApplicationPermissionContext,
  ): ReadonlySet<ApplicationAction> {
    const evaluator =
      APPLICATION_PERMISSIONS[ctx.applicationStatus]?.[ctx.userRole];

    return evaluator ? evaluator(ctx) : new Set<ApplicationAction>();
  }

  canPerformApplicationAction(
    action: ApplicationAction,
    ctx: ApplicationPermissionContext,
  ): boolean {
    return this.getAllowedApplicationActions(ctx).has(action);
  }

  assertApplicationAction(
    action: ApplicationAction,
    ctx: ApplicationPermissionContext,
  ): void {
    if (!this.canPerformApplicationAction(action, ctx)) {
      throw new ForbiddenException(
        `Action "${action}" is not permitted for role "${ctx.userRole}" ` +
          `on application status "${ctx.applicationStatus}".`,
      );
    }
  }
}
