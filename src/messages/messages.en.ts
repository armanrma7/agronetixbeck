/**
 * English (EN) – centralized user-facing messages and notifications.
 * All keys must exist in messages.hy.ts and messages.ru.ts.
 */
export const messages = {
  announcements: {
    creationCancelled: 'Your announcement was not created.',
    createdVerificationNeeded:
      'Announcement was created successfully. Awaiting verification.',
    creationError: 'Creation failed. Try again.',
    published: 'Your announcement has been approved and published.',
    edited: 'Your announcement was updated.',
    expiringSoon: 'Your announcement is expiring soon.',
    closed: 'Your announcement has been closed.',
    autoClosed: 'Your announcement has been automatically closed.',
    blocked: 'Your announcement has been blocked by an administrator.',
    canceled: 'Your announcement has been canceled.',
    newInRegion: 'New announcement in your region',
    newInRegionBody: 'New announcement in your area.',
    rentalPeriodEnded: 'Your rent announcement has been automatically closed as the rental period has ended.',
    announcementExpired: 'Your announcement has been automatically closed as it has reached its expiry date.',
    publishedTitle: 'Announcement Published',
    blockedTitle: 'Announcement Blocked',
    closedTitle: 'Announcement Closed',
    expiredTitle: 'Announcement Expired',
  },
  applications: {
    newApplication: 'New Application',
    applicationApproved: 'Application Approved',
    applicationRejected: 'Application Rejected',
    applicationClosed: 'Application Closed',
    applicationCanceled: 'Application Canceled',
    applicationCanceledBody: 'Your application has been canceled.',
    approveConfirmTitle: 'Approve Application',
    approveConfirmBody: 'Do you want to approve the application?',
    rejectConfirmTitle: 'Reject Application',
    rejectConfirmBody: 'Do you want to reject the application?',
  },
  validation: {
    fillRequiredFields: 'Fill all required fields to enable submit.',
  },
  common: {
    ok: 'OK',
    cancel: 'Cancel',
    confirm: 'Confirm',
  },
} as const;
