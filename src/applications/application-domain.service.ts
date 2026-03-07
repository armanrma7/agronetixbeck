/**
 * ApplicationDomainService
 *
 * Domain-layer orchestrator for application state transitions.
 * It does NOT own any database queries – it receives pre-loaded data and
 * delegates state/permission rules to the purpose-built services.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { ApplicationAction } from '../common/enums/application-action.enum';
import { ApplicationStatus } from '../common/enums/application-status.enum';
import { AnnouncementStatus } from '../common/enums/announcement-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ApplicationStateService } from '../common/state/application-state.service';
import { PermissionService } from '../common/services/permission.service';
import { ContactVisibilityService } from '../common/services/contact-visibility.service';
import { ApplicationPermissionContext } from '../common/types/permission-context.types';

// ─── Minimal entity shapes ─────────────────────────────────────────────────────

interface ApplicationRow {
  id: string;
  status: ApplicationStatus;
  applicantId: string;
  announcementId: string;
}

interface AnnouncementRow {
  id: string;
  status: AnnouncementStatus;
  ownerId: string;
}

interface CallerInfo {
  userId: string;
  role: UserRole;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ApplicationDomainService {
  private readonly logger = new Logger(ApplicationDomainService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly applicationStateService: ApplicationStateService,
    private readonly permissionService: PermissionService,
    private readonly contactVisibilityService: ContactVisibilityService,
  ) {}

  /**
   * Performs a state-changing action on an application.
   *
   * APPLY_AGAIN is NOT handled here – it creates a new application, so
   * it should be delegated to createApplication() after a permission check.
   */
  async performAction(
    applicationId: string,
    action: ApplicationAction,
    caller: CallerInfo,
  ): Promise<void> {
    await this.dataSource.transaction(async (em: EntityManager) => {
      // ── Load ─────────────────────────────────────────────────────────────────
      const application = await em.findOne<ApplicationRow>(
        'Application' as any,
        { where: { id: applicationId } },
      );
      if (!application) {
        throw new NotFoundException(`Application ${applicationId} not found.`);
      }

      const announcement = await em.findOne<AnnouncementRow>(
        'Announcement' as any,
        { where: { id: application.announcementId } },
      );
      if (!announcement) {
        throw new NotFoundException(
          `Announcement ${application.announcementId} not found.`,
        );
      }

      // ── Build context ────────────────────────────────────────────────────────
      const ctx: ApplicationPermissionContext = {
        userRole: caller.role,
        applicationStatus: application.status,
        announcementStatus: announcement.status,
        isApplicationOwner: application.applicantId === caller.userId,
        isAnnouncementOwner: announcement.ownerId === caller.userId,
      };

      // ── Permission check ─────────────────────────────────────────────────────
      this.permissionService.assertApplicationAction(action, ctx);

      // ── Resolve target status ────────────────────────────────────────────────
      const targetStatus = this.applicationStateService.resolveTransition(
        action,
        ctx,
      );

      // ── Persist ──────────────────────────────────────────────────────────────
      await em.update('Application' as any, applicationId, {
        status: targetStatus,
      } as any);

      this.logger.log(
        `Application ${applicationId}: ${application.status} → ${targetStatus} ` +
          `(action: ${action}, caller: ${caller.userId}).`,
      );
    });
  }

  /**
   * Validates that the caller may submit a new "apply again" application.
   * Throws ForbiddenException if not allowed.
   *
   * The actual creation should be performed by your existing createApplication()
   * method after this check passes.
   */
  assertCanApplyAgain(
    existingApplication: ApplicationRow,
    announcement: AnnouncementRow,
    caller: CallerInfo,
  ): void {
    const ctx: ApplicationPermissionContext = {
      userRole: caller.role,
      applicationStatus: existingApplication.status,
      announcementStatus: announcement.status,
      isApplicationOwner: existingApplication.applicantId === caller.userId,
      isAnnouncementOwner: announcement.ownerId === caller.userId,
    };

    // Uses the dedicated check in ApplicationStateService
    if (!this.applicationStateService.canApplyAgain(ctx)) {
      this.permissionService.assertApplicationAction(
        ApplicationAction.APPLY_AGAIN,
        ctx,
      );
    }
  }

  /**
   * Returns allowed actions for a caller on a given application.
   * Useful for dynamic UIs.
   */
  getAvailableActions(
    application: ApplicationRow,
    announcement: AnnouncementRow,
    caller: CallerInfo,
  ): ReadonlySet<ApplicationAction> {
    const ctx: ApplicationPermissionContext = {
      userRole: caller.role,
      applicationStatus: application.status,
      announcementStatus: announcement.status,
      isApplicationOwner: application.applicantId === caller.userId,
      isAnnouncementOwner: announcement.ownerId === caller.userId,
    };

    return this.permissionService.getAllowedApplicationActions(ctx);
  }

  /**
   * Checks whether contact details should be visible for this application.
   */
  areContactsVisible(
    application: ApplicationRow,
    announcement: AnnouncementRow,
  ): boolean {
    return this.contactVisibilityService.isVisible({
      announcementStatus: announcement.status,
      applicationStatus: application.status,
    });
  }
}
