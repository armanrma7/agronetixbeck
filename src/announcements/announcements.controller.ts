import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFiles,
  ParseFilePipe,
  FileTypeValidator,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AnnouncementStatus } from '../entities/announcement.entity';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CanCreateAnnouncementGuard } from './guards/can-create-announcement.guard';
import { AnnouncementOwnerGuard } from './guards/announcement-owner.guard';
import { AnnouncementOwnerOrAdminGuard } from './guards/announcement-owner-or-admin.guard';
import { IsAdminGuard } from './guards/is-admin.guard';
import { StorageService } from '../storage/storage.service';

@ApiTags('announcements')
@Controller('announcements')
export class AnnouncementsController {
  private readonly logger = new Logger(AnnouncementsController.name);

  constructor(
    private readonly announcementsService: AnnouncementsService,
    private readonly storageService: StorageService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, CanCreateAnnouncementGuard)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 3 }], {
      limits: { fileSize: 6 * 1024 * 1024 }, // 6MB per file (buffer to allow files through, validation in service)
    })
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Create a new announcement with optional image uploads' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['type', 'category', 'group_id', 'item_id', 'price'],
      properties: {
        type: { type: 'string', enum: ['sell', 'buy'] },
        category: { type: 'string', enum: ['goods', 'rent', 'service'] },
        group_id: { type: 'string', format: 'uuid' },
        item_id: { type: 'string', format: 'uuid' },
        price: { type: 'number' },
        description: { type: 'string' },
        count: { type: 'number' },
        daily_limit: { type: 'number' },
        unit: { type: 'string' },
        date_from: { type: 'string', format: 'date' },
        date_to: { type: 'string', format: 'date' },
        min_area: { type: 'number' },
        regions: {
          type: 'array',
          items: { 
            type: 'string', 
            format: 'uuid',
          },
          description: 'Optional array of region UUIDs. In multipart/form-data, send multiple fields with same name: regions=uuid1, regions=uuid2',
          example: ['uuid1', 'uuid2'],
        },
        villages: {
          type: 'array',
          items: { 
            type: 'string', 
            format: 'uuid',
          },
          description: 'Optional array of village UUIDs. In multipart/form-data, send multiple fields with same name: villages=uuid1, villages=uuid2',
          example: ['uuid1', 'uuid2'],
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Image files (JPEG, PNG, WebP) - max 5MB each, max 3 files',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Announcement created successfully. Returns either "submitted for verification" or "published" message.',
  })
  @ApiResponse({ status: 400, description: 'Validation error (missing required fields, invalid catalog references, etc.)' })
  @ApiResponse({ status: 403, description: 'User cannot create announcements (not verified, blocked, or wrong user type)' })
  async create(
    @Body() createDto: any, // Will be parsed from multipart/form-data
    // @UploadedFiles(
    //   new ParseFilePipe({
    //     fileIsRequired: false,
    //     validators: [
    //       // Validate file type - FileTypeValidator checks mimetype, not filename
    //       new FileTypeValidator({ fileType: /^image\/(jpeg|jpg|png|webp)$/ }),
    //     ],
    //   })
    // )
    @UploadedFiles() images: { images?: any[] },
    @Request() req,
  ) {
    // Validate image count (max 3)
    const uploadedImages = images?.images || [];
    if (uploadedImages.length > 3) {
      throw new BadRequestException(
        `Maximum 3 images allowed. Received ${uploadedImages.length} images.`
      );
    }

    // Parse arrays from multipart form data
    const parsedDto: CreateAnnouncementDto = {
      ...createDto,
      // Ensure regions is an array
      regions: Array.isArray(createDto.regions) 
        ? createDto.regions 
        : createDto.regions 
          ? [createDto.regions] 
          : undefined,
      // Ensure villages is an array
      villages: Array.isArray(createDto.villages) 
        ? createDto.villages 
        : createDto.villages 
          ? [createDto.villages] 
          : undefined,
      // Parse numbers
      price: createDto.price ? Number(createDto.price) : undefined,
      count: createDto.count ? Number(createDto.count) : undefined,
      daily_limit: createDto.daily_limit ? Number(createDto.daily_limit) : undefined,
      min_area: createDto.min_area ? Number(createDto.min_area) : undefined,
    };

    // Validate total image count (uploaded + existing URLs)
    const existingImageCount = Array.isArray(parsedDto.images) ? parsedDto.images.length : 0;
    const totalImageCount = uploadedImages.length + existingImageCount;
    if (totalImageCount > 3) {
      throw new BadRequestException(
        `Maximum 3 images allowed. You have ${existingImageCount} existing image(s) and ${uploadedImages.length} new upload(s) (total: ${totalImageCount}).`
      );
    }

    // Upload images if provided
    let imagePaths: string[] = [];
    if (uploadedImages.length > 0) {
      try {
        imagePaths = await this.storageService.uploadImages(uploadedImages);
      } catch (error) {
        this.logger.error(`Error uploading images: ${error.message}`, error.stack);
        throw error;
      }
    }

    // Merge uploaded image paths with any existing paths from DTO
    // Note: DTO may contain URLs, but we only store paths in DB
    const allImagePaths = [
      ...(parsedDto.images || []).filter(path => !path.startsWith('http')), // Filter out URLs if any
      ...imagePaths
    ];

    // Create announcement with image paths (not URLs)
    return this.announcementsService.create(
      { ...parsedDto, images: allImagePaths },
      req.user.id
    );
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Get all announcements with filters (excludes current user\'s announcements if authenticated)' })
  @ApiQuery({ name: 'category', required: false, enum: ['goods', 'rent', 'service'] })
  @ApiQuery({ name: 'type', required: false, enum: ['sell', 'buy'] })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'published', 'closed', 'canceled', 'blocked'] })
  @ApiQuery({ name: 'region', required: false, description: 'Region UUID (can be multiple: ?region=uuid1&region=uuid2)' })
  @ApiQuery({ name: 'village', required: false, description: 'Village UUID (can be multiple: ?village=uuid1&village=uuid2)' })
  @ApiQuery({ name: 'created_from', required: false, description: 'Filter by created_at from date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'created_to', required: false, description: 'Filter by created_at to date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of announcements with pagination (excludes current user\'s announcements)',
  })
  async findAll(
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('region') region?: string | string[],
    @Query('village') village?: string | string[],
    @Query('created_from') created_from?: string,
    @Query('created_to') created_to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    // Validate status enum if provided
    if (status) {
      const validStatuses = Object.values(AnnouncementStatus);
      if (!validStatuses.includes(status as AnnouncementStatus)) {
        throw new BadRequestException(
          `Invalid status value: "${status}". Valid values are: ${validStatuses.join(', ')}`
        );
      }
    }

    // Normalize region and village to arrays
    const regions = Array.isArray(region) ? region : region ? [region] : undefined;
    const villages = Array.isArray(village) ? village : village ? [village] : undefined;

    // Get current user ID if authenticated (optional)
    const currentUserId = req?.user?.id;

    return this.announcementsService.findAll({
      category,
      type,
      status: status as AnnouncementStatus | undefined,
      regions,
      villages,
      created_from,
      created_to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      excludeOwnerId: currentUserId, // Exclude current user's announcements
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user\'s announcements with filters' })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'published', 'closed', 'canceled', 'blocked'] })
  @ApiQuery({ name: 'region', required: false, description: 'Region UUID (can be multiple: ?region=uuid1&region=uuid2)' })
  @ApiQuery({ name: 'village', required: false, description: 'Village UUID (can be multiple: ?village=uuid1&village=uuid2)' })
  @ApiQuery({ name: 'created_from', required: false, description: 'Filter by created_at from date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'created_to', required: false, description: 'Filter by created_at to date (YYYY-MM-DD)' })
  @ApiResponse({
    status: 200,
    description: 'List of user\'s announcements with filters applied',
  })
  async findMyAnnouncements(
    @Request() req,
    @Query('status') status?: string,
    @Query('region') region?: string | string[],
    @Query('village') village?: string | string[],
    @Query('created_from') created_from?: string,
    @Query('created_to') created_to?: string,
  ) {
    // Normalize region and village to arrays
    const regions = Array.isArray(region) ? region : region ? [region] : undefined;
    const villages = Array.isArray(village) ? village : village ? [village] : undefined;

    // Validate status enum if provided
    if (status) {
      const validStatuses = Object.values(AnnouncementStatus);
      if (!validStatuses.includes(status as AnnouncementStatus)) {
        throw new BadRequestException(
          `Invalid status value: "${status}". Valid values are: ${validStatuses.join(', ')}`
        );
      }
    }

    return this.announcementsService.findUserAnnouncements(req.user.id, {
      status: status as AnnouncementStatus | undefined,
      regions,
      villages,
      created_from,
      created_to,
    });
  }

  @Get('applied')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get announcements where current user has applied' })
  @ApiResponse({
    status: 200,
    description: 'List of announcements where the user has created applications',
  })
  async findAnnouncementsWithMyApplications(@Request() req) {
    return this.announcementsService.findAnnouncementsWithMyApplications(req.user.id);
  }

  @Post(':id/view')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a view for an announcement (one view per user)' })
  @ApiResponse({
    status: 200,
    description: 'View recorded successfully or user already viewed',
    schema: {
      type: 'object',
      properties: {
        viewed: { type: 'boolean', description: 'Whether this was a new view (true) or user already viewed (false)' },
        views_count: { type: 'number', description: 'Total number of unique views' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Only published announcements can be viewed' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async recordView(@Param('id') id: string, @Request() req) {
    return this.announcementsService.recordView(id, req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get announcement by ID' })
  @ApiResponse({
    status: 200,
    description: 'Announcement details with relations (owner, group, item)',
  })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async findOne(@Param('id') id: string) {
    return this.announcementsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AnnouncementOwnerOrAdminGuard)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'images', maxCount: 3 }], {
      limits: { fileSize: 6 * 1024 * 1024 }, // 6MB per file (buffer to allow files through, validation in service)
    })
  )
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Update announcement with optional image uploads (owner or admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        price: { type: 'number' },
        description: { type: 'string' },
        count: { type: 'number' },
        daily_limit: { type: 'number' },
        unit: { type: 'string' },
        date_from: { type: 'string', format: 'date' },
        date_to: { type: 'string', format: 'date' },
        min_area: { type: 'number' },
        regions: {
          type: 'array',
          items: { 
            type: 'string', 
            format: 'uuid',
          },
          description: 'Optional array of region UUIDs. In multipart/form-data, send multiple fields with same name: regions=uuid1, regions=uuid2',
          example: ['uuid1', 'uuid2'],
        },
        villages: {
          type: 'array',
          items: { 
            type: 'string', 
            format: 'uuid',
          },
          description: 'Optional array of village UUIDs. In multipart/form-data, send multiple fields with same name: villages=uuid1, villages=uuid2',
          example: ['uuid1', 'uuid2'],
        },
        images: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: 'Image files (JPEG, PNG, WebP) - max 5MB each, max 3 files',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Announcement updated successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Not the owner or admin, or announcement is published' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: any, // Will be parsed from multipart/form-data
    @UploadedFiles(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          // Validate file type - FileTypeValidator checks mimetype, not filename
          // Mimetypes are like: image/jpeg, image/png, image/webp
          new FileTypeValidator({ fileType: /^image\/(jpeg|jpg|png|webp)$/ }),
        ],
      })
    )
    files: { images?: any[] }, // Express.Multer.File[]
    @Request() req,
  ) {
    // Parse arrays from multipart form data
    const parsedDto: UpdateAnnouncementDto = {
      ...updateDto,
      // Ensure regions is an array
      regions: Array.isArray(updateDto.regions) 
        ? updateDto.regions 
        : updateDto.regions 
          ? [updateDto.regions] 
          : undefined,
      // Ensure villages is an array
      villages: Array.isArray(updateDto.villages) 
        ? updateDto.villages 
        : updateDto.villages 
          ? [updateDto.villages] 
          : undefined,
      // Parse numbers
      price: updateDto.price ? Number(updateDto.price) : undefined,
      count: updateDto.count ? Number(updateDto.count) : undefined,
      daily_limit: updateDto.daily_limit ? Number(updateDto.daily_limit) : undefined,
      min_area: updateDto.min_area ? Number(updateDto.min_area) : undefined,
    };

    // Validate image count (max 3)
    const uploadedImages = files?.images || [];
    if (uploadedImages.length > 3) {
      throw new BadRequestException(
        `Maximum 3 images allowed. Received ${uploadedImages.length} images.`
      );
    }

    // Get existing announcement to check current image count
    const existingAnnouncement = await this.announcementsService.findOne(id);
    const existingImageCount = existingAnnouncement.images?.length || 0;
    const newImageCount = uploadedImages.length;
    const existingFromDto = Array.isArray(parsedDto.images) ? parsedDto.images.length : 0;
    
    // Calculate total: existing in DB + new uploads + existing from DTO (if replacing)
    const totalImageCount = Math.max(existingImageCount, existingFromDto) + newImageCount;
    if (totalImageCount > 3) {
      throw new BadRequestException(
        `Maximum 3 images allowed. Current: ${existingImageCount}, new uploads: ${newImageCount}, total would be: ${totalImageCount}.`
      );
    }

    // Upload new images if provided
    let newImagePaths: string[] = [];
    if (uploadedImages.length > 0) {
      try {
        newImagePaths = await this.storageService.uploadImages(uploadedImages);
      } catch (error) {
        this.logger.error(`Error uploading images during update: ${error.message}`, error.stack);
        throw error;
      }
    }

    // Merge new image paths with existing paths from DTO
    // Filter out URLs if any (only store paths)
    const allImagePaths = [
      ...(parsedDto.images || []).filter(path => !path.startsWith('http')),
      ...newImagePaths
    ];

    // Update announcement with image paths (not URLs)
    return this.announcementsService.update(
      id,
      { ...parsedDto, images: allImagePaths.length > 0 ? allImagePaths : undefined },
      req.user.id,
      req.user.user_type
    );
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard, IsAdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish announcement (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Announcement published successfully',
  })
  @ApiResponse({ status: 400, description: 'Announcement is not pending' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  async publish(@Param('id') id: string, @Request() req) {
    return this.announcementsService.publish(id, req.user.id);
  }

  @Post(':id/block')
  @UseGuards(JwtAuthGuard, IsAdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block announcement (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Announcement blocked successfully',
  })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  async block(@Param('id') id: string, @Request() req) {
    return this.announcementsService.block(id, req.user.id);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard, AnnouncementOwnerOrAdminGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close announcement (owner or admin)' })
  @ApiResponse({
    status: 200,
    description: 'Announcement closed successfully',
  })
  @ApiResponse({ status: 400, description: 'Announcement is already closed' })
  @ApiResponse({ status: 403, description: 'Not the owner or admin' })
  async close(@Param('id') id: string, @Request() req) {
    const announcement = await this.announcementsService.close(id, req.user.id);
    return { 
      message: 'Announcement closed successfully',
      announcement,
    };
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, AnnouncementOwnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel announcement (owner only)' })
  @ApiResponse({
    status: 200,
    description: 'Announcement canceled successfully',
  })
  @ApiResponse({ status: 400, description: 'Announcement cannot be canceled' })
  @ApiResponse({ status: 403, description: 'Not the owner' })
  async cancel(@Param('id') id: string, @Request() req) {
    const announcement = await this.announcementsService.cancel(id, req.user.id);
    return { 
      message: 'Announcement canceled successfully',
      announcement,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AnnouncementOwnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete announcement (owner only, soft delete)' })
  @ApiResponse({
    status: 204,
    description: 'Announcement deleted successfully',
  })
  @ApiResponse({ status: 403, description: 'Not the owner or announcement is published' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async remove(@Param('id') id: string, @Request() req) {
    await this.announcementsService.remove(id, req.user.id);
  }
}
