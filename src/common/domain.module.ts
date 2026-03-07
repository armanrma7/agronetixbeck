/**
 * DomainModule
 *
 * Registers all domain-layer services so they can be injected into
 * announcement and application modules via imports: [DomainModule].
 *
 * Usage in any feature module:
 *
 *   @Module({
 *     imports: [DomainModule],
 *     ...
 *   })
 *   export class AnnouncementsModule {}
 */
import { Module } from '@nestjs/common';

import { AnnouncementStateService } from './state/announcement-state.service';
import { ApplicationStateService } from './state/application-state.service';
import { PermissionService } from './services/permission.service';
import { ContactVisibilityService } from './services/contact-visibility.service';

const DOMAIN_SERVICES = [
  AnnouncementStateService,
  ApplicationStateService,
  PermissionService,
  ContactVisibilityService,
];

@Module({
  providers: DOMAIN_SERVICES,
  exports: DOMAIN_SERVICES,
})
export class DomainModule {}
