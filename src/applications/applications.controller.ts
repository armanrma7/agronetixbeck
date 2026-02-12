import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new application to an announcement' })
  @ApiResponse({
    status: 201,
    description: 'Application created successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'User cannot apply' })
  async create(
    @Body() createDto: CreateApplicationDto,
    @Request() req,
  ) {
    return this.applicationsService.create(createDto.announcement_id, createDto, req.user.id);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get applications (filtered by announcementId if provided)' })
  @ApiQuery({
    name: 'announcementId',
    required: false,
    description: 'Filter applications by announcement ID (announcer only)',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'List of applications',
  })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  async findAll(
    @Query('announcementId') announcementId?: string,
    @Request() req?,
  ) {
    if (announcementId) {
      // If announcementId is provided, return applications for that announcement (announcer only)
      return this.applicationsService.findByAnnouncement(announcementId, req.user.id);
    }
    // Otherwise return all applications (admin only or user's own)
    // For now, return user's own applications
    return this.applicationsService.findMyApplications(req.user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user\'s applications' })
  @ApiResponse({
    status: 200,
    description: 'List of user\'s applications',
  })
  async findMyApplications(@Request() req) {
    return this.applicationsService.findMyApplications(req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a specific application by ID' })
  @ApiResponse({
    status: 200,
    description: 'Application details',
  })
  @ApiResponse({ status: 404, description: 'Application not found' })
  async findOne(@Param('id') id: string) {
    return this.applicationsService.findOne(id);
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve application (announcer only)' })
  @ApiResponse({
    status: 200,
    description: 'Application approved successfully',
  })
  @ApiResponse({ status: 403, description: 'Not the announcer' })
  async approve(
    @Param('id') applicationId: string,
    @Request() req,
  ) {
    const application = await this.applicationsService.findOne(applicationId);
    await this.applicationsService.approve(application.announcement_id, applicationId, req.user.id);
    return { message: 'Application approved successfully' };
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject application (announcer only)' })
  @ApiResponse({
    status: 200,
    description: 'Application rejected successfully',
  })
  @ApiResponse({ status: 403, description: 'Not the announcer' })
  async reject(
    @Param('id') applicationId: string,
    @Request() req,
  ) {
    const application = await this.applicationsService.findOne(applicationId);
    await this.applicationsService.reject(application.announcement_id, applicationId, req.user.id);
    return { message: 'Application rejected successfully' };
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close application (announcer only)' })
  @ApiResponse({
    status: 200,
    description: 'Application closed successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 403, description: 'Not the announcer' })
  async close(
    @Param('id') applicationId: string,
    @Request() req,
  ) {
    const application = await this.applicationsService.findOne(applicationId);
    const closed = await this.applicationsService.close(application.announcement_id, applicationId, req.user.id);
    return { message: 'Application closed successfully', application: closed };
  }
}

