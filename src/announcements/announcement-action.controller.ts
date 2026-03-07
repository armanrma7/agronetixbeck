/**
 * AnnouncementActionController
 *
 * Handles the POST /announcements/:id/action endpoint.
 * Uses the domain service to validate permissions and drive the state machine.
 */
import {
  Body,
  Controller,
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

import { AnnouncementAction } from '../common/enums/announcement-action.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AnnouncementDomainService } from './announcement-domain.service';
import { AnnouncementActionDto } from './dto/announcement-action.dto';

// ─── Placeholder decorators ────────────────────────────────────────────────────
// Replace with your actual JWT guard and CurrentUser decorator.

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

@ApiTags('Announcements')
@ApiBearerAuth()
@UseGuards(JwtGuard() as any)
@Controller('announcements')
export class AnnouncementActionController {
  constructor(
    private readonly announcementDomainService: AnnouncementDomainService,
  ) {}

  /**
   * POST /announcements/:id/action
   *
   * Performs a validated state-changing action on an announcement.
   *
   * Valid actions per role:
   *  ANNOUNCER  – CANCEL, CLOSE
   *  ADMIN      – VERIFY, BLOCK, DEACTIVATE
   *
   * VIEW and APPLY are handled by dedicated GET / POST /apply endpoints.
   */
  @Post(':id/action')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Perform a state-changing action on an announcement',
    description:
      'Validates role, current status, and any business conditions before ' +
      'transitioning the announcement. Cascades status changes to related ' +
      'applications when required.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: AnnouncementActionDto })
  @ApiResponse({ status: 204, description: 'Action applied successfully.' })
  @ApiResponse({ status: 400, description: 'Action not valid for current status or conditions.' })
  @ApiResponse({ status: 403, description: 'Role not permitted to perform this action.' })
  @ApiResponse({ status: 404, description: 'Announcement not found.' })
  async performAction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnnouncementActionDto,
    @CurrentUser() caller: AuthenticatedUser,
  ): Promise<void> {
    await this.announcementDomainService.performAction(id, dto.action, {
      userId: caller.id,
      role: caller.role,
    });
  }

  /**
   * GET /announcements/:id/actions
   *
   * Returns the list of actions available to the calling user.
   * The frontend can use this to show/hide action buttons without guessing.
   */
  @Get(':id/actions')
  @ApiOperation({
    summary: 'Get available actions for the calling user on an announcement',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'List of allowed actions.',
    schema: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          items: { type: 'string', enum: Object.values(AnnouncementAction) },
          example: [AnnouncementAction.CANCEL, AnnouncementAction.CLOSE],
        },
      },
    },
  })
  async getAvailableActions(
    @Param('id', ParseUUIDPipe) _id: string,
    @CurrentUser() _caller: AuthenticatedUser,
  ): Promise<{ actions: AnnouncementAction[] }> {
    /**
     * Implementation note:
     * Load the announcement + its applications from the repository,
     * then call announcementDomainService.getAvailableActions(...).
     *
     * Example:
     *   const announcement = await this.announcementsRepo.findOneOrFail(id);
     *   const applications = await this.applicationsRepo.findBy({ announcementId: id });
     *   const actionsSet = this.announcementDomainService.getAvailableActions(
     *     announcement, applications, { userId: caller.id, role: caller.role }
     *   );
     *   return { actions: [...actionsSet] };
     */
    return { actions: [] }; // replace with real implementation
  }
}
