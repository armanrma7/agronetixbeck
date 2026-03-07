import { AnnouncementStatus } from '../enums/announcement-status.enum';
import { ApplicationStatus } from '../enums/application-status.enum';
import { UserRole } from '../enums/user-role.enum';

/**
 * Context passed to every announcement permission / state-machine evaluation.
 * All booleans must be pre-computed by the caller before evaluation.
 */
export interface AnnouncementPermissionContext {
  /** Role of the requesting user */
  userRole: UserRole;
  /** Current status of the announcement */
  announcementStatus: AnnouncementStatus;
  /** True when the requesting user is the owner/announcer of this announcement */
  isOwner: boolean;
  /** True when at least one application exists on this announcement */
  hasApplications: boolean;
  /** True when at least one application on this announcement has APPROVED status */
  hasApprovedApplication: boolean;
  /** True when the requesting user (APPLICANT role) has a PENDING application on this announcement */
  hasOwnPendingApplication: boolean;
  /** True when the requesting user (APPLICANT role) has ever applied to this announcement */
  hasApplied: boolean;
}

/**
 * Context passed to every application permission / state-machine evaluation.
 */
export interface ApplicationPermissionContext {
  /** Role of the requesting user */
  userRole: UserRole;
  /** Current status of the specific application */
  applicationStatus: ApplicationStatus;
  /** Current status of the parent announcement */
  announcementStatus: AnnouncementStatus;
  /** True when the requesting user is the applicant who submitted this application */
  isApplicationOwner: boolean;
  /** True when the requesting user is the announcer who owns the parent announcement */
  isAnnouncementOwner: boolean;
}

/**
 * Contact visibility context – a simpler projection used only by ContactVisibilityService.
 */
export interface ContactVisibilityContext {
  announcementStatus: AnnouncementStatus;
  applicationStatus: ApplicationStatus;
}
