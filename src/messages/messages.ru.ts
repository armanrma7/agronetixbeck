/**
 * Russian (RU) – centralized user-facing messages and notifications.
 */
export const messages = {
  announcements: {
    creationCancelled: 'Ваше объявление не было создано.',
    createdVerificationNeeded:
      'Объявление успешно создано. Ожидает проверки.',
    creationError: 'Не удалось создать. Попробуйте снова.',
    published: 'Ваше объявление одобрено и опубликовано.',
    edited: 'Ваше объявление обновлено.',
    expiringSoon: 'Срок действия вашего объявления скоро истекает.',
    closed: 'Ваше объявление закрыто.',
    autoClosed: 'Ваше объявление было автоматически закрыто.',
    blocked: 'Ваше объявление заблокировано администратором.',
    canceled: 'Ваше объявление отменено.',
    newInRegion: 'Новое объявление в вашем регионе',
    newInRegionBody: 'Новое объявление в вашем районе.',
    rentalPeriodEnded: 'Ваше объявление об аренде автоматически закрыто по окончании срока.',
    announcementExpired: 'Ваше объявление автоматически закрыто по истечении срока.',
    publishedTitle: 'Объявление опубликовано',
    blockedTitle: 'Объявление заблокировано',
    closedTitle: 'Объявление закрыто',
    expiredTitle: 'Срок объявления истёк',
  },
  applications: {
    newApplication: 'Новая заявка',
    applicationApproved: 'Заявка одобрена',
    applicationRejected: 'Заявка отклонена',
    applicationClosed: 'Заявка закрыта',
    applicationCanceled: 'Заявка отменена',
    applicationCanceledBody: 'Ваша заявка отменена.',
    approveConfirmTitle: 'Одобрить заявку',
    approveConfirmBody: 'Вы хотите одобрить заявку?',
    rejectConfirmTitle: 'Отклонить заявку',
    rejectConfirmBody: 'Вы хотите отклонить заявку?',
  },
  validation: {
    fillRequiredFields: 'Заполните все обязательные поля для отправки.',
  },
  common: {
    ok: 'ОК',
    cancel: 'Отмена',
    confirm: 'Подтвердить',
  },
} as const;
