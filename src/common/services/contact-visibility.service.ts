import { Injectable } from '@nestjs/common';
import { AnnouncementStatus } from '../enums/announcement-status.enum';
import { ApplicationStatus } from '../enums/application-status.enum';
import { ContactVisibilityContext } from '../types/permission-context.types';

/**
 * Encapsulates the single rule:
 *
 *   Contacts are visible ONLY when:
 *     • Announcement is ACTIVE or CLOSED
 *     • AND the relevant application is APPROVED
 *
 * Both the announcer and the applicant see contacts under this condition.
 * Everyone else (and every other status combination) sees nothing.
 */

const CONTACT_VISIBLE_ANNOUNCEMENT_STATUSES = new Set<AnnouncementStatus>([
  AnnouncementStatus.ACTIVE,
  AnnouncementStatus.CLOSED,
]);

@Injectable()
export class ContactVisibilityService {
  /**
   * Returns true when the contact details of both parties should be exposed.
   */
  isVisible(ctx: ContactVisibilityContext): boolean {
    return (
      CONTACT_VISIBLE_ANNOUNCEMENT_STATUSES.has(ctx.announcementStatus) &&
      ctx.applicationStatus === ApplicationStatus.APPROVED
    );
  }

  /**
   * Convenience helper: strips contact fields from an object when the contact
   * should not be visible. Returns a copy of the object.
   *
   * @param data   – the object to sanitize (shallow copy is made)
   * @param fields – property names that represent contact information
   * @param ctx    – visibility context
   */
  sanitize<T extends Record<string, unknown>>(
    data: T,
    fields: ReadonlyArray<keyof T>,
    ctx: ContactVisibilityContext,
  ): T {
    if (this.isVisible(ctx)) return data;

    const sanitized = { ...data };
    for (const field of fields) {
      (sanitized as Record<string, unknown>)[field as string] = undefined;
    }
    return sanitized;
  }
}
