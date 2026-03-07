# Notifications and Centralized Messages

## Centralized message system (EN, HY, RU)

All user-facing messages and notifications use the same message keys. The backend sends a **messageKey** in the notification payload so the mobile app can resolve the string in the user's language.

### Backend structure

- `src/messages/messages.en.ts` – English
- `src/messages/messages.hy.ts` – Armenian  
- `src/messages/messages.ru.ts` – Russian
- `src/messages/index.ts` – `getMessage(key, language)` helper

### API for mobile

- **GET /messages/resolve?key=announcements.published&lang=hy**  
  Returns `{ "value": "..." }` – use for resolving a single key (e.g. when displaying a notification).

- **GET /messages/:lang**  
  Returns the full bundle for `en`, `hy`, or `ru` – use for caching and local `getMessage(key, language)`.

### Message keys (examples)

- `announcements.createdVerificationNeeded` – after creating an announcement
- `announcements.published` – announcement approved and published
- `announcements.newInRegion` / `announcements.newInRegionBody` – new announcement in user’s region/village
- `announcements.blocked`, `announcements.closed`, `announcements.announcementExpired`, etc.
- `applications.newApplication`, `applications.applicationApproved`, `applications.applicationRejected`, `applications.applicationClosed`, `applications.applicationCanceled`
- `applications.approveConfirmTitle`, `applications.approveConfirmBody`, `applications.rejectConfirmTitle`, `applications.rejectConfirmBody`
- `validation.fillRequiredFields`

---

## FCM payload shape

Push notifications are sent with:

- **notification**: `title`, `body` (fallback in English from backend)
- **data**: all values are strings (FCM requirement)

### Data fields (always or often present)

| Key               | Description                                      |
|-------------------|--------------------------------------------------|
| `notification_id` | UUID of the stored notification (for mark-as-seen) |
| `type`            | NotificationType enum value (e.g. `application_approved`) |
| `messageKey`      | Key for resolving title/body in user language (e.g. `applications.applicationApproved`) |
| `announcement_id` | When the notification is about an announcement   |
| `application_id`  | When the notification is about an application   |

### Navigation (mobile)

Use `type`, `announcement_id`, and `application_id` to route the user:

- **application_created** → announcement owner: e.g. Announcement detail or Applications list for that announcement
- **application_approved** / **rejected** / **closed** / **application_canceled** → applicant: e.g. Application detail or My applications
- **announcement_published** (owner) → My announcements
- **announcement_published** (region/village) → Announcement detail (`announcement_id`)
- **announcement_created** → My announcements
- **announcement_closed** / **announcement_blocked** / **announcement_canceled** / **announcement_auto_closed** → My announcements or announcement detail

Handle in:

- **Foreground**: `notifee.onForegroundEvent`
- **Background**: `notifee.onBackgroundEvent`
- **Killed**: `notifee.getInitialNotification`

Use the existing navigation service; do not introduce a new navigation system.

---

## Backend notification triggers

| Event                         | Recipient(s)                    | NotificationType              |
|------------------------------|----------------------------------|--------------------------------|
| Announcement created         | Owner                            | ANNOUNCEMENT_CREATED           |
| Announcement published       | Owner                            | ANNOUNCEMENT_PUBLISHED         |
| Announcement published       | Users in selected regions/villages | ANNOUNCEMENT_PUBLISHED         |
| Announcement blocked         | Owner                            | (via FCM helper)               |
| Announcement closed / expired| Owner                            | (via FCM helper)               |
| New application              | Announcement owner               | APPLICATION_CREATED            |
| Application approved         | Applicant                        | APPLICATION_APPROVED          |
| Application rejected         | Applicant                        | APPLICATION_REJECTED          |
| Application closed           | Applicant                        | APPLICATION_CLOSED            |
| Application canceled         | Applicant                        | APPLICATION_CANCELED          |

---

## Database migration

After deploying, run for new notification types:

```bash
psql $DATABASE_URL -f database/migrations_notifications_add_message_types.sql
```
