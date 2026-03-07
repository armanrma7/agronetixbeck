/**
 * Armenian (HY) – centralized user-facing messages and notifications.
 */
export const messages = {
  announcements: {
    creationCancelled: 'Ձեր հայտարարությունը չի ստեղծվել։',
    createdVerificationNeeded:
      'Հայտարարությունը հաջողությամբ ստեղծվել է։ Սպասվում է ստուգում։',
    creationError: 'Ստեղծումը ձախողվեց։ Խնդրում ենք կրկին փորձել։',
    published: 'Ձեր հայտարարությունը հաստատվել և հրապարակվել է։',
    edited: 'Ձեր հայտարարությունը թարմացվել է։',
    expiringSoon: 'Ձեր հայտարարությունը շուտով ավարտվում է։',
    closed: 'Ձեր հայտարարությունը փակվել է։',
    autoClosed: 'Ձեր հայտարարությունը ավտոմատ փակվել է։',
    blocked: 'Ձեր հայտարարությունը ադմինիստրատորի կողմից արգելափակվել է։',
    canceled: 'Ձեր հայտարարությունը չեղարկվել է։',
    newInRegion: 'Նոր հայտարարություն ձեր տարածաշրջանում',
    newInRegionBody: 'Նոր հայտարարություն ձեր տարածքում։',
    rentalPeriodEnded:
      'Ձեր վարձակալության հայտարարությունը ավտոմատ փակվել է ժամկետի ավարտի պատճառով։',
    announcementExpired:
      'Ձեր հայտարարությունը ավտոմատ փակվել է ժամկետի ավարտի պատճառով։',
    publishedTitle: 'Հայտարարությունը հրապարակվել է',
    blockedTitle: 'Հայտարարությունը արգելափակվել է',
    closedTitle: 'Հայտարարությունը փակվել է',
    expiredTitle: 'Հայտարարության ժամկետը ավարտվել է',
  },
  applications: {
    newApplication: 'Նոր դիմում',
    applicationApproved: 'Դիմումը հաստատվել է',
    applicationRejected: 'Դիմումը մերժվել է',
    applicationClosed: 'Դիմումը փակվել է',
    applicationCanceled: 'Դիմումը չեղարկվել է',
    applicationCanceledBody: 'Ձեր դիմումը չեղարկվել է։',
    approveConfirmTitle: 'Հաստատել դիմումը',
    approveConfirmBody: 'Ցանկանու՞մ եք հաստատել դիմումը։',
    rejectConfirmTitle: 'Մերժել դիմումը',
    rejectConfirmBody: 'Ցանկանու՞մ եք մերժել դիմումը։',
  },
  validation: {
    fillRequiredFields: 'Լրացրեք բոլոր պարտադիր դաշտերը՝ ուղարկելու համար։',
  },
  common: {
    ok: 'Լավ',
    cancel: 'Չեղարկել',
    confirm: 'Հաստատել',
  },
} as const;
