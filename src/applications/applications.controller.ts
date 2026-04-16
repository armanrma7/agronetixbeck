import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
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
  ApiParam,
} from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtActiveGuard } from '../auth/guards/jwt-active.guard';
import { UserType } from '../entities/user.entity';

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @UseGuards(JwtActiveGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new application to an announcement' })
  @ApiResponse({
    status: 201,
    description: 'Application created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'User cannot apply' })
  async create(@Body() createDto: CreateApplicationDto, @Request() req) {
    return this.applicationsService.create(createDto.announcement_id, createDto, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get applications with pagination',
    description: 'Without announcementId: admin sees all applications; other users see only their own. With announcementId: announcement owner or admin sees that announcement\'s applications.',
  })
  @ApiQuery({
    name: 'announcementId',
    required: false,
    description: 'Filter applications by announcement ID (announcement owner or admin)',
    type: String,
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
    description: 'Paginated list of applications',
    schema: {
      type: 'object',
      properties: {
        applications: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number', description: 'Total number of applications matching filters' },
        page: { type: 'number', description: 'Current page number' },
        limit: { type: 'number', description: 'Items per page' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  async findAll(
    @Query('announcementId') announcementId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?,
  ) {
    // Validate pagination parameters
    const pageNum = page ? Number(page) : undefined;
    const limitNum = limit ? Number(limit) : undefined;
    
    if (pageNum !== undefined && pageNum < 1) {
      throw new BadRequestException('Page must be >= 1');
    }
    
    if (limitNum !== undefined && (limitNum < 1 || limitNum > 100)) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    if (announcementId) {
      return this.applicationsService.findByAnnouncement(
        announcementId,
        req.user.id,
        req.user.user_type,
        pageNum,
        limitNum,
      );
    }
    // Admin: all applications; otherwise user's own
    if (req.user.user_type === UserType.ADMIN) {
      return this.applicationsService.findAllForAdmin(pageNum, limitNum);
    }
    return this.applicationsService.findMyApplications(req.user.id, pageNum, limitNum);
  }

  @Get('announcement/:announcementId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get applications for an announcement (pending & approved only)',
    description: 'Only the announcement owner or an admin can call this. Returns only PENDING and APPROVED applications.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Default 20, max 100' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of pending and approved applications',
    schema: {
      type: 'object',
      properties: {
        applications: { type: 'array', items: { type: 'object' } },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not the announcement owner or admin' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async getByAnnouncement(
    @Param('announcementId') announcementId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?,
  ) {
    const pageNum = page ? Number(page) : undefined;
    const limitNum = limit ? Number(limit) : undefined;
    if (pageNum !== undefined && pageNum < 1) {
      throw new BadRequestException('Page must be >= 1');
    }
    if (limitNum !== undefined && (limitNum < 1 || limitNum > 100)) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }
    return this.applicationsService.findByAnnouncement(
      announcementId,
      req.user.id,
      req.user.user_type,
      pageNum,
      limitNum,
    );
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user\'s applications with pagination' })
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
    description: 'Paginated list of user\'s applications',
    schema: {
      type: 'object',
      properties: {
        applications: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number', description: 'Total number of applications' },
        page: { type: 'number', description: 'Current page number' },
        limit: { type: 'number', description: 'Items per page' },
      },
    },
  })
  async findMyApplications(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    // Validate pagination parameters
    const pageNum = page ? Number(page) : undefined;
    const limitNum = limit ? Number(limit) : undefined;
    
    if (pageNum !== undefined && pageNum < 1) {
      throw new BadRequestException('Page must be >= 1');
    }
    
    if (limitNum !== undefined && (limitNum < 1 || limitNum > 100)) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    return this.applicationsService.findMyApplications(req.user.id, pageNum, limitNum);
  }

  @Patch(':id')
  @UseGuards(JwtActiveGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit application (announcer or applicant, when pending)',
  })
  @ApiResponse({ status: 200, description: 'Application updated successfully' })
  @ApiResponse({ status: 400, description: 'Only pending applications can be edited' })
  @ApiResponse({ status: 403, description: 'Not the announcer or the applicant' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async update(
    @Param('id') applicationId: string,
    @Body() updateDto: UpdateApplicationDto,
    @Request() req,
  ) {
    return this.applicationsService.update(applicationId, updateDto, req.user.id, req.user.user_type);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a specific application by ID',
    description: 'Applicant, announcement owner, or admin can view any application.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application details',
  })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async findOne(@Param('id') id: string, @Request() req?) {
    return this.applicationsService.findOne(id, req?.user?.id, req?.user?.user_type);
  }

  @Post(':id/approve')
  @UseGuards(JwtActiveGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve application (announcer or admin)' })
  @ApiResponse({
    status: 200,
    description: 'Application approved successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Application approved successfully' },
        application: { type: 'object', description: 'Updated application' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Not the announcer or admin' })
  async approve(
    @Param('id') applicationId: string,
    @Request() req,
  ) {
    const application = await this.applicationsService.findOne(applicationId);
    const updated = await this.applicationsService.approve(application.announcement_id, applicationId, req.user.id, req.user.user_type);
    return { message: 'Application approved successfully', application: updated };
  }

  @Post(':id/reject')
  @UseGuards(JwtActiveGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject application (announcement owner or admin)' })
  @ApiResponse({
    status: 200,
    description: 'Application rejected successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Application rejected successfully' },
        application: { type: 'object', description: 'Updated application' },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Only the announcement owner or admin can reject' })
  async reject(
    @Param('id') applicationId: string,
    @Request() req,
  ) {
    const application = await this.applicationsService.findOne(applicationId);
    const updated = await this.applicationsService.reject(application.announcement_id, applicationId, req.user.id, req.user.user_type);
    return { message: 'Application rejected successfully', application: updated };
  }

  @Post(':id/cancel')
  @UseGuards(JwtActiveGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Application UUID', type: String })
  @ApiOperation({
    summary: 'Cancel application (applicant only)',
    description:
      'The applicant (application owner) can cancel their own application when status is PENDING or APPROVED. ' +
      'Sets application status to CANCELED.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application canceled successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Application canceled successfully' },
        application: { type: 'object', description: 'Updated application' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cancel not allowed for current status (e.g. already closed/rejected)',
  })
  @ApiResponse({ status: 403, description: 'Only the application owner can cancel' })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async cancel(
    @Param('id') applicationId: string,
    @Request() req,
  ) {
    const application = await this.applicationsService.cancel(applicationId, req.user.id, req.user.user_type);
    return { message: 'Application canceled successfully', application };
  }

  @Post(':id/close')
  @UseGuards(JwtActiveGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close application',
    description: 'Announcement owner can close any time. Application owner (applicant) can close their own application only when it is pending.',
  })
  @ApiResponse({
    status: 200,
    description: 'Application closed successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Application closed successfully' },
        application: { type: 'object', description: 'Updated application' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition or only pending can be closed by applicant' })
  @ApiResponse({ status: 403, description: 'Not the announcer or the applicant' })
  async close(
    @Param('id') applicationId: string,
    @Request() req,
  ) {
    const application = await this.applicationsService.findOne(applicationId);
    const closed = await this.applicationsService.close(application.announcement_id, applicationId, req.user.id, req.user.user_type);
    return { message: 'Application closed successfully', application: closed };
  }
}

