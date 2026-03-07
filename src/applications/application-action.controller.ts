/**
 * ApplicationActionController
 *
 * Handles:
 *   POST /applications/:id/action        – state-changing action
 *   POST /applications/:id/cancel       – cancel application (applicant owner)
 *   POST /applications/:id/apply-again   – re-apply (creates new application)
 *   GET  /applications/:id/actions      – available actions for calling user
 *   GET  /applications/:id/contacts      – contact details (visibility-gated)
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApplicationAction } from '../common/enums/application-action.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { ApplicationDomainService } from './application-domain.service';
import { ApplicationActionDto } from './dto/application-action.dto';

// ─── Placeholder decorators ────────────────────────────────────────────────────

function JwtGuard(): ClassDecorator & MethodDecorator {
  return (_target: any, _key?: any, _desc?: any) => {};
}
function CurrentUser(): ParameterDecorator {
  return (_target: any, _key: any, _index: number) => {};
}

interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtGuard() as any)
@Controller('applications')
export class ApplicationActionController {
  constructor(
    private readonly applicationDomainService: ApplicationDomainService,
  ) {}

  /**
   * POST /applications/:id/action
   *
   * Actions per role & status:
   *
   *  PENDING   →  ANNOUNCER: APPROVE, REJECT  |  APPLICANT(owner): CANCEL  |  ADMIN: BLOCK
   *  APPROVED  →  ANNOUNCER: REJECT           |  APPLICANT(owner): CANCEL  |  ADMIN: BLOCK
   *  REJECTED  →  ADMIN: BLOCK, DEACTIVATE
   *  CANCELED  →  ADMIN: BLOCK, DEACTIVATE
   *  BLOCKED   →  ADMIN: DEACTIVATE
   */
  @Post(':id/action')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Perform a state-changing action on an application' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: ApplicationActionDto })
  @ApiResponse({ status: 204, description: 'Action applied successfully.' })
  @ApiResponse({ status: 400, description: 'Action not valid for current status or conditions.' })
  @ApiResponse({ status: 403, description: 'Role not permitted to perform this action.' })
  @ApiResponse({ status: 404, description: 'Application not found.' })
  async performAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplicationActionDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    await this.applicationDomainService.performAction(id, dto.action, {
      userId: caller.id,
      role: caller.role,
    });
  }

  /**
   * POST /applications/:id/cancel
   *
   * Cancels the application. Allowed for the applicant (owner) when status is PENDING or APPROVED.
   * Delegates to the same permission and state logic as POST :id/action with action=CANCEL.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cancel an application',
    description:
      'Applicant can cancel their own application when it is PENDING or APPROVED. ' +
      'Uses the same validation as POST /applications/:id/action with action=CANCEL.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Application canceled successfully.' })
  @ApiResponse({ status: 400, description: 'Cancel not allowed for current status.' })
  @ApiResponse({ status: 403, description: 'Only the application owner can cancel.' })
  @ApiResponse({ status: 404, description: 'Application not found.' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    await this.applicationDomainService.performAction(id, ApplicationAction.CANCEL, {
      userId: caller.id,
      role: caller.role,
    });
  }

  /**
   * POST /applications/:id/apply-again
   *
   * Creates a fresh PENDING application on the same announcement.
   * Allowed when the existing application is APPROVED, REJECTED, or CANCELED
   * and the announcement is still ACTIVE.
   */
  @Post(':id/apply-again')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Re-apply after an application was approved, rejected, or canceled',
    description:
      'Creates a new PENDING application on the parent announcement. ' +
      'The original application is kept for audit purposes.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'New application created.' })
  @ApiResponse({ status: 403, description: 'Re-apply is not allowed in the current state.' })
  async applyAgain(
    @Param('id', ParseUUIDPipe) _id: string,
    @CurrentUser() _caller: AuthenticatedUser,
  ): Promise<{ newApplicationId: string }> {
    /**
     * Implementation note:
     *
     *   const application  = await this.applicationsRepo.findOneOrFail(id);
     *   const announcement = await this.announcementsRepo.findOneOrFail(application.announcementId);
     *
     *   this.applicationDomainService.assertCanApplyAgain(application, announcement, {
     *     userId: caller.id, role: caller.role,
     *   });
     *
     *   const newApp = await this.applicationsRepo.save({
     *     announcementId: application.announcementId,
     *     applicantId:    caller.id,
     *     status:         ApplicationStatus.PENDING,
     *   });
     *   return { newApplicationId: newApp.id };
     */
    throw new ForbiddenException('Not yet implemented – see code comment above.');
  }

  /**
   * GET /applications/:id/actions
   *
   * Returns the list of actions available to the calling user on this application.
   */
  @Get(':id/actions')
  @ApiOperation({ summary: 'Get available actions for the calling user on an application' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: { type: 'string', enum: Object.values(ApplicationAction) },
        },
      },
    },
  })
  async getAvailableActions(
    @Param('id', ParseUUIDPipe) _id: string,
    @CurrentUser() _caller: AuthenticatedUser,
  ): Promise<{ actions: ApplicationAction[] }> {
    /**
     * const application  = await this.applicationsRepo.findOneOrFail(id);
     * const announcement = await this.announcementsRepo.findOneOrFail(application.announcementId);
     * const actionsSet   = this.applicationDomainService.getAvailableActions(
     *   application, announcement, { userId: caller.id, role: caller.role }
     * );
     * return { actions: [...actionsSet] };
     */
    return { actions: [] };
  }

  /**
   * GET /applications/:id/contacts
   *
   * Returns contact details of both parties only when:
   *   announcement.status = ACTIVE | CLOSED
   *   AND application.status = APPROVED
   */
  @Get(':id/contacts')
  @ApiOperation({
    summary: 'Get contact details (visible only when application is approved)',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Contact details (empty when not eligible).',
    schema: {
      type: 'object',
      properties: {
        visible: { type: 'boolean' },
        announcer: {
          type: 'object',
          nullable: true,
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
        },
        applicant: {
          type: 'object',
          nullable: true,
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            email: { type: 'string' },
          },
        },
      },
    },
  })
  async getContacts(
    @Param('id', ParseUUIDPipe) _id: string,
    @CurrentUser() _caller: AuthenticatedUser,
  ): Promise<{
    visible: boolean;
    announcer: Record<string, string> | null;
    applicant: Record<string, string> | null;
  }> {
    /**
     * const application  = await this.applicationsRepo.findOneOrFail(id, { relations: ['applicant'] });
     * const announcement = await this.announcementsRepo.findOneOrFail(
     *   application.announcementId, { relations: ['owner'] }
     * );
     *
     * const visible = this.applicationDomainService.areContactsVisible(application, announcement);
     *
     * return {
     *   visible,
     *   announcer: visible ? { name: announcement.owner.name, phone: announcement.owner.phone } : null,
     *   applicant: visible ? { name: application.applicant.name, phone: application.applicant.phone } : null,
     * };
     */
    return { visible: false, announcer: null, applicant: null };
  }
}
