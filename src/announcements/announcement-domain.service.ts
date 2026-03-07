/**
 * AnnouncementDomainService
 *
 * Domain-layer orchestrator for announcement state transitions.
 * It does NOT own any database queries – it receives pre-loaded data and
 * delegates state/permission rules to the purpose-built services.
 *
 * Your existing AnnouncementsService should call this service for every
 * mutating action instead of performing its own permission/state logic.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { AnnouncementAction } from '../common/enums/announcement-action.enum';
import { AnnouncementStatus } from '../common/enums/announcement-status.enum';
import { ApplicationStatus } from '../common/enums/application-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AnnouncementStateService } from '../common/state/announcement-state.service';
import { PermissionService } from '../common/services/permission.service';
import { AnnouncementPermissionContext } from '../common/types/permission-context.types';

// ─── Minimal entity shapes needed by this service ─────────────────────────────
// Replace with your actual TypeORM entities.

interface AnnouncementRow {
  id: string;
  status: AnnouncementStatus;
  ownerId: string;
}

interface ApplicationRow {
  id: string;
  status: ApplicationStatus;
  applicantId: string;
}

interface CallerInfo {
  userId: string;
  role: UserRole;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AnnouncementDomainService {
  private readonly logger = new Logger(AnnouncementDomainService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly announcementStateService: AnnouncementStateService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Performs a state-changing action on an announcement.
   *
   * Steps:
   *  1. Load the announcement + its applications.
   *  2. Build the permission context.
   *  3. Assert the caller is allowed to perform the action.
   *  4. Resolve the target status via the state machine.
   *  5. Persist the status change and cascade to applications — atomically.
   */
  async performAction(
    announcementId: string,
    action: AnnouncementAction,
    caller: CallerInfo,
  ): Promise<void> {
    await this.dataSource.transaction(async (em: EntityManager) => {
      // ── 1. Load data ─────────────────────────────────────────────────────────
      // Replace with your actual repository calls.
      const announcement = await em.findOne<AnnouncementRow>(
        'Announcement' as any,
        { where: { id: announcementId } },
      );

      if (!announcement) {
        throw new NotFoundException(`Announcement ${announcementId} not found.`);
      }

      const applications = await em.find<ApplicationRow>('Application' as any, {
        where: { announcementId } as any,
      });

      // ── 2. Build permission context ──────────────────────────────────────────
      const hasApplications = applications.length > 0;
      const hasApprovedApplication = applications.some(
        (a) => a.status === ApplicationStatus.APPROVED,
      );
      const hasOwnPendingApplication = applications.some(
        (a) =>
          a.applicantId === caller.userId &&
          a.status === ApplicationStatus.PENDING,
      );
      const hasApplied = applications.some(
        (a) => a.applicantId === caller.userId,
      );

      const ctx: AnnouncementPermissionContext = {
        userRole: caller.role,
        announcementStatus: announcement.status,
        isOwner: announcement.ownerId === caller.userId,
        hasApplications,
        hasApprovedApplication,
        hasOwnPendingApplication,
        hasApplied,
      };

      // ── 3. Permission check ──────────────────────────────────────────────────
      this.permissionService.assertAnnouncementAction(action, ctx);

      // ── 4. Resolve target status ─────────────────────────────────────────────
      const targetStatus = this.announcementStateService.resolveTransition(
        action,
        ctx,
      );

      if (targetStatus === announcement.status) {
        // VERIFY on ACTIVE is a no-op status-wise; log and return.
        this.logger.log(
          `Action "${action}" confirmed on announcement ${announcementId} (status unchanged: ${targetStatus}).`,
        );
        return;
      }

      // ── 5. Persist atomically ────────────────────────────────────────────────
      await em.update('Announcement' as any, announcementId, {
        status: targetStatus,
      } as any);

      // Cascade application status updates
      const cascade = this.announcementStateService.getApplicationCascade(
        announcement.status,
        targetStatus,
      );
      const cascadeUpdates = this.announcementStateService.buildCascadeUpdates(
        applications,
        cascade,
      );

      if (cascadeUpdates.size > 0) {
        // Group by target status for efficient batch updates
        const byTargetStatus = new Map<ApplicationStatus, string[]>();

        for (const [appId, newStatus] of cascadeUpdates) {
          const group = byTargetStatus.get(newStatus) ?? [];
          group.push(appId);
          byTargetStatus.set(newStatus, group);
        }

        for (const [newStatus, ids] of byTargetStatus) {
          await em.update('Application' as any, { id: In(ids) } as any, {
            status: newStatus,
          } as any);
        }

        this.logger.log(
          `Cascaded ${cascadeUpdates.size} application status updates ` +
            `(announcement ${announcement.status} → ${targetStatus}).`,
        );
      }

      this.logger.log(
        `Announcement ${announcementId}: ${announcement.status} → ${targetStatus} ` +
          `(action: ${action}, caller: ${caller.userId}).`,
      );
    });
  }

  /**
   * Returns the list of actions available to a caller on a given announcement.
   * Useful for building dynamic UIs that show only valid action buttons.
   */
  getAvailableActions(
    announcement: AnnouncementRow,
    applications: ApplicationRow[],
    caller: CallerInfo,
  ): ReadonlySet<AnnouncementAction> {
    const ctx: AnnouncementPermissionContext = {
      userRole: caller.role,
      announcementStatus: announcement.status,
      isOwner: announcement.ownerId === caller.userId,
      hasApplications: applications.length > 0,
      hasApprovedApplication: applications.some(
        (a) => a.status === ApplicationStatus.APPROVED,
      ),
      hasOwnPendingApplication: applications.some(
        (a) =>
          a.applicantId === caller.userId &&
          a.status === ApplicationStatus.PENDING,
      ),
      hasApplied: applications.some((a) => a.applicantId === caller.userId),
    };

    return this.permissionService.getAllowedAnnouncementActions(ctx);
  }
}
