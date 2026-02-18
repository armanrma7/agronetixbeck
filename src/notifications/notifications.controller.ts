import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { NotificationType } from '../entities/notification.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notifications for current user with filters and pagination' })
  @ApiQuery({
    name: 'is_seen',
    required: false,
    type: Boolean,
    description: 'Filter by seen status (true/false)',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: NotificationType,
    description: 'Filter by notification type',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20, max: 100)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of notifications',
    schema: {
      type: 'object',
      properties: {
        notifications: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number', description: 'Total number of notifications matching filters' },
        page: { type: 'number', description: 'Current page number' },
        limit: { type: 'number', description: 'Items per page' },
        unread_count: { type: 'number', description: 'Total unread notifications count' },
      },
    },
  })
  async findAll(
    @Request() req,
    @Query('is_seen') is_seen?: string,
    @Query('type') type?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    // Parse is_seen boolean
    let isSeenBool: boolean | undefined;
    if (is_seen !== undefined) {
      if (is_seen === 'true') {
        isSeenBool = true;
      } else if (is_seen === 'false') {
        isSeenBool = false;
      } else {
        throw new BadRequestException('is_seen must be "true" or "false"');
      }
    }

    // Validate type enum if provided
    let notificationType: NotificationType | undefined;
    if (type) {
      const validTypes = Object.values(NotificationType);
      if (!validTypes.includes(type as NotificationType)) {
        throw new BadRequestException(
          `Invalid type value: "${type}". Valid values are: ${validTypes.join(', ')}`,
        );
      }
      notificationType = type as NotificationType;
    }

    // Validate pagination parameters
    const pageNum = page ? Number(page) : undefined;
    const limitNum = limit ? Number(limit) : undefined;

    if (pageNum !== undefined && pageNum < 1) {
      throw new BadRequestException('Page must be >= 1');
    }

    if (limitNum !== undefined && (limitNum < 1 || limitNum > 100)) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    return this.notificationService.findAll(req.user.id, {
      is_seen: isSeenBool,
      type: notificationType,
      page: pageNum,
      limit: limitNum,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count for current user' })
  @ApiResponse({
    status: 200,
    description: 'Unread notification count',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number' },
      },
    },
  })
  async getUnreadCount(@Request() req) {
    const count = await this.notificationService.getUnreadCount(req.user.id);
    return { count };
  }

  @Patch(':id/seen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as seen' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as seen',
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsSeen(@Param('id') id: string, @Request() req) {
    return this.notificationService.markAsSeen(id, req.user.id);
  }

  @Patch('seen-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as seen for current user' })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as seen',
    schema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of notifications marked as seen' },
      },
    },
  })
  async markAllAsSeen(@Request() req) {
    return this.notificationService.markAllAsSeen(req.user.id);
  }
}
