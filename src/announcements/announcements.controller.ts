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
  ParseUUIDPipe,
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

  private normalizeStorageKey(pathOrUrl: string): string {
    const raw = (pathOrUrl || '').trim();
    if (!raw) return raw;

    // If it's already a storage key (no URL), keep it as-is
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      return raw;
    }

    // Signed URL format: .../storage/v1/object/sign/<bucket>/<key>?token=...
    const signMatch = raw.match(/\/object\/sign\/[^/]+\/(.+?)(\?|$)/);
    if (signMatch?.[1]) {
      return decodeURIComponent(signMatch[1]);
    }

    // Public URL format: .../storage/v1/object/public/<bucket>/<key>
    const publicMatch = raw.match(/\/object\/public\/[^/]+\/(.+?)(\?|$)/);
    if (publicMatch?.[1]) {
      return decodeURIComponent(publicMatch[1]);
    }

    // Fallback: best-effort extract path after "/storage/v1/object/"
    try {
      const u = new URL(raw);
      const parts = u.pathname.split('/').filter(Boolean);
      const objectIdx = parts.findIndex((p) => p === 'object');
      if (objectIdx !== -1 && objectIdx + 3 < parts.length) {
        // object/{sign|public}/{bucket}/{...key}
        return decodeURIComponent(parts.slice(objectIdx + 3).join('/'));
      }
    } catch {
      // ignore
    }

    return raw;
  }

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

    // Validate image files manually (more flexible than ParseFilePipe)
    if (uploadedImages.length > 0) {
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      
      for (const file of uploadedImages) {
        const mimetype = file.mimetype?.toLowerCase() || '';
        const extension = file.originalname?.toLowerCase().substring(file.originalname.lastIndexOf('.')) || '';
        
        const isValidMimeType = allowedMimeTypes.includes(mimetype);
        const isValidExtension = allowedExtensions.includes(extension);
        
        if (!isValidMimeType && !isValidExtension) {
          this.logger.warn(`Invalid image file: ${file.originalname}, mimetype: ${mimetype}, extension: ${extension}`);
          throw new BadRequestException(
            `Invalid image file "${file.originalname}". ` +
            `MIME type: ${mimetype || 'unknown'}, extension: ${extension || 'none'}. ` +
            `Allowed types: JPEG, JPG, PNG, WebP. ` +
            `Allowed MIME types: ${allowedMimeTypes.join(', ')}`
          );
        }
      }
    }

    // Parse arrays and dates from multipart form data (support both snake_case and camelCase)
    const dateFromRaw = createDto.date_from ?? createDto.dateFrom;
    const dateToRaw = createDto.date_to ?? createDto.dateTo;
    const parsedDto: CreateAnnouncementDto = {
      ...createDto,
      date_from: typeof dateFromRaw === 'string' && dateFromRaw.trim() ? dateFromRaw.trim() : undefined,
      date_to: typeof dateToRaw === 'string' && dateToRaw.trim() ? dateToRaw.trim() : undefined,
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
    const existingImageCount = Array.isArray(parsedDto.images)
      ? parsedDto.images.map((p) => this.normalizeStorageKey(p)).filter(Boolean).length
      : 0;
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
      ...(parsedDto.images || [])
        .map((p) => this.normalizeStorageKey(p))
        .filter(Boolean),
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
  @ApiOperation({
    summary: 'Get all announcements with filters',
    description: 'Returns published announcements (or filtered by status). Optional filters: category, type, status, group, subgroup, region, village, price range (price_from, price_to), date range. Category, group_id, and subgroup_id can be repeated for multiple values (OR). Excludes current user\'s announcements if authenticated.',
  })
  @ApiQuery({ name: 'category', required: false, enum: ['goods', 'rent', 'service'], isArray: true, description: 'Filter by category (repeat for multiple: ?category=goods&category=rent)' })
  @ApiQuery({ name: 'type', required: false, enum: ['sell', 'buy'] })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'published', 'closed', 'canceled', 'blocked'] })
  @ApiQuery({ name: 'group_id', required: false, isArray: true, description: 'Filter by group — GoodsCategory UUID(s); repeat for multiple' })
  @ApiQuery({ name: 'subgroup_id', required: false, isArray: true, description: 'Filter by subgroup — GoodsSubcategory UUID(s); repeat for multiple' })
  @ApiQuery({ name: 'region', required: false, description: 'Region UUID (can be multiple: ?region=uuid1&region=uuid2)' })
  @ApiQuery({ name: 'village', required: false, description: 'Village UUID (can be multiple: ?village=uuid1&village=uuid2)' })
  @ApiQuery({ name: 'price_from', required: false, description: 'Minimum price (inclusive)' })
  @ApiQuery({ name: 'price_to', required: false, description: 'Maximum price (inclusive)' })
  @ApiQuery({ name: 'created_from', required: false, description: 'Filter by created_at from date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'created_to', required: false, description: 'Filter by created_at to date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20)' })
  @ApiResponse({
    status: 200,
    description: 'List of announcements with pagination (excludes current user\'s announcements)',
    schema: {
      type: 'object',
      properties: {
        announcements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              type: { type: 'string', enum: ['sell', 'buy'] },
              category: { type: 'string', enum: ['goods', 'rent', 'service'] },
              group_id: { type: 'string', format: 'uuid' },
              group: { type: 'object', description: 'GoodsCategory (name_am, name_en, name_ru)' },
              item_id: { type: 'string', format: 'uuid' },
              item: { type: 'object', description: 'GoodsItem (belongs to subgroup); name_am, name_en, name_ru, measurements' },
              price: { type: 'number' },
              status: { type: 'string', enum: ['pending', 'published', 'closed', 'canceled', 'blocked'] },
              owner: { type: 'object', properties: { id: { type: 'string' }, full_name: { type: 'string' } } },
              regions_data: { type: 'array', description: 'Resolved region names' },
              applications_count: { type: 'number' },
            },
          },
        },
        total: { type: 'number', description: 'Total number of announcements matching filters' },
        page: { type: 'number', description: 'Current page number' },
        limit: { type: 'number', description: 'Items per page' },
      },
    },
  })
  async findAll(
    @Query('category') category?: string | string[],
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('group_id') group_id?: string | string[],
    @Query('subgroup_id') subgroup_id?: string | string[],
    @Query('region') region?: string | string[],
    @Query('village') village?: string | string[],
    @Query('price_from') price_from?: string,
    @Query('price_to') price_to?: string,
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

    // Normalize to arrays (one or many)
    const categories = Array.isArray(category) ? category : category ? [category] : undefined;
    const groupIds = Array.isArray(group_id) ? group_id : group_id ? [group_id] : undefined;
    const subgroupIds = Array.isArray(subgroup_id) ? subgroup_id : subgroup_id ? [subgroup_id] : undefined;
    const regions = Array.isArray(region) ? region : region ? [region] : undefined;
    const villages = Array.isArray(village) ? village : village ? [village] : undefined;

    // Validate category values if provided
    if (categories && categories.length > 0) {
      const validCategories = ['goods', 'rent', 'service'];
      for (const c of categories) {
        if (!validCategories.includes(c)) {
          throw new BadRequestException(
            `Invalid category value: "${c}". Valid values are: ${validCategories.join(', ')}`
          );
        }
      }
    }

    const currentUserId = req?.user?.id;

    const priceFromNum = price_from !== undefined && price_from !== '' ? Number(price_from) : undefined;
    const priceToNum = price_to !== undefined && price_to !== '' ? Number(price_to) : undefined;
    if (priceFromNum !== undefined && (Number.isNaN(priceFromNum) || priceFromNum < 0)) {
      throw new BadRequestException('price_from must be a non-negative number');
    }
    if (priceToNum !== undefined && (Number.isNaN(priceToNum) || priceToNum < 0)) {
      throw new BadRequestException('price_to must be a non-negative number');
    }

    return this.announcementsService.findAll({
      category: categories,
      type,
      status: status as AnnouncementStatus | undefined,
      group_id: groupIds,
      subgroup_id: subgroupIds,
      regions,
      villages,
      price_from: priceFromNum,
      price_to: priceToNum,
      created_from,
      created_to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      excludeOwnerId: currentUserId,
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user\'s announcements with filters and pagination',
    description: 'Returns announcements owned by the current user. Filters: status, category, group, subgroup, region, village, price range (price_from, price_to), date range.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'published', 'closed', 'canceled', 'blocked'] })
  @ApiQuery({ name: 'category', required: false, enum: ['goods', 'rent', 'service'], isArray: true, description: 'Filter by category (repeat for multiple)' })
  @ApiQuery({ name: 'group_id', required: false, isArray: true, description: 'Filter by group — GoodsCategory UUID(s); repeat for multiple' })
  @ApiQuery({ name: 'subgroup_id', required: false, isArray: true, description: 'Filter by subgroup — GoodsSubcategory UUID(s); repeat for multiple' })
  @ApiQuery({ name: 'region', required: false, description: 'Region UUID (can be multiple: ?region=uuid1&region=uuid2)' })
  @ApiQuery({ name: 'village', required: false, description: 'Village UUID (can be multiple: ?village=uuid1&village=uuid2)' })
  @ApiQuery({ name: 'price_from', required: false, description: 'Minimum price (inclusive)' })
  @ApiQuery({ name: 'price_to', required: false, description: 'Maximum price (inclusive)' })
  @ApiQuery({ name: 'created_from', required: false, description: 'Filter by created_at from date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'created_to', required: false, description: 'Filter by created_at to date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of user\'s announcements with filters applied',
    schema: {
      type: 'object',
      properties: {
        announcements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              type: { type: 'string', enum: ['sell', 'buy'] },
              category: { type: 'string', enum: ['goods', 'rent', 'service'] },
              group_id: { type: 'string', format: 'uuid' },
              group: { type: 'object', description: 'GoodsCategory (group)' },
              item_id: { type: 'string', format: 'uuid' },
              item: { type: 'object', description: 'GoodsItem (subgroup via item.subcategory)' },
              price: { type: 'number' },
              status: { type: 'string', enum: ['pending', 'published', 'closed', 'canceled', 'blocked'] },
              owner: { type: 'object' },
              regions_data: { type: 'array' },
              applications_count: { type: 'number' },
            },
          },
        },
        total: { type: 'number', description: 'Total number of announcements matching filters' },
        page: { type: 'number', description: 'Current page number' },
        limit: { type: 'number', description: 'Items per page' },
      },
    },
  })
  async findMyAnnouncements(
    @Request() req,
    @Query('status') status?: string,
    @Query('category') category?: string | string[],
    @Query('group_id') group_id?: string | string[],
    @Query('subgroup_id') subgroup_id?: string | string[],
    @Query('region') region?: string | string[],
    @Query('village') village?: string | string[],
    @Query('price_from') price_from?: string,
    @Query('price_to') price_to?: string,
    @Query('created_from') created_from?: string,
    @Query('created_to') created_to?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const categories = Array.isArray(category) ? category : category ? [category] : undefined;
    const groupIds = Array.isArray(group_id) ? group_id : group_id ? [group_id] : undefined;
    const subgroupIds = Array.isArray(subgroup_id) ? subgroup_id : subgroup_id ? [subgroup_id] : undefined;
    const regions = Array.isArray(region) ? region : region ? [region] : undefined;
    const villages = Array.isArray(village) ? village : village ? [village] : undefined;

    if (categories && categories.length > 0) {
      const validCategories = ['goods', 'rent', 'service'];
      for (const c of categories) {
        if (!validCategories.includes(c)) {
          throw new BadRequestException(
            `Invalid category value: "${c}". Valid values are: ${validCategories.join(', ')}`
          );
        }
      }
    }

    if (status) {
      const validStatuses = Object.values(AnnouncementStatus);
      if (!validStatuses.includes(status as AnnouncementStatus)) {
        throw new BadRequestException(
          `Invalid status value: "${status}". Valid values are: ${validStatuses.join(', ')}`
        );
      }
    }

    const pageNum = page ? Number(page) : 1;
    const limitNum = limit ? Number(limit) : 20;
    
    if (pageNum < 1) {
      throw new BadRequestException('Page must be >= 1');
    }
    
    if (limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const priceFromNum = price_from !== undefined && price_from !== '' ? Number(price_from) : undefined;
    const priceToNum = price_to !== undefined && price_to !== '' ? Number(price_to) : undefined;
    if (priceFromNum !== undefined && (Number.isNaN(priceFromNum) || priceFromNum < 0)) {
      throw new BadRequestException('price_from must be a non-negative number');
    }
    if (priceToNum !== undefined && (Number.isNaN(priceToNum) || priceToNum < 0)) {
      throw new BadRequestException('price_to must be a non-negative number');
    }

    return this.announcementsService.findUserAnnouncements(req.user.id, {
      status: status as AnnouncementStatus | undefined,
      category: categories,
      group_id: groupIds,
      subgroup_id: subgroupIds,
      regions,
      villages,
      price_from: priceFromNum,
      price_to: priceToNum,
      created_from,
      created_to,
      page: pageNum,
      limit: limitNum,
    });
  }

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Search announcements by text',
    description: 'Search by phrase in description and item/group names. Returns paginated results; each announcement includes group (GoodsCategory) and item (GoodsItem, subgroup via item.subcategory).',
  })
  @ApiQuery({ name: 'q', required: true, description: 'Search phrase (matches description and item/group names)' })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', default: 1 } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 20, maximum: 50 }, description: 'Max 50' })
  @ApiResponse({
    status: 200,
    description: 'Paginated search results; each item includes group and item (subgroup)',
    schema: {
      type: 'object',
      properties: {
        announcements: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              group_id: { type: 'string', format: 'uuid' },
              group: { type: 'object', description: 'GoodsCategory (group)' },
              item_id: { type: 'string', format: 'uuid' },
              item: { type: 'object', description: 'GoodsItem (subgroup)' },
              price: { type: 'number' },
              type: { type: 'string' },
              category: { type: 'string' },
              status: { type: 'string' },
            },
          },
        },
        total: { type: 'number' },
        page: { type: 'number' },
        limit: { type: 'number' },
      },
    },
  })
  async search(
    @Query('q') q?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Request() req?: any,
  ) {
    return this.announcementsService.search({
      q: q || '',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      excludeOwnerId: req?.user?.id,
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
  @ApiOperation({
    summary: 'Get announcement by ID',
    description: 'Returns full announcement with owner, group (GoodsCategory), and item (GoodsItem; item belongs to a subgroup).',
  })
  @ApiResponse({
    status: 200,
    description: 'Announcement details with relations (owner, group, item with subgroup)',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        type: { type: 'string', enum: ['sell', 'buy'] },
        category: { type: 'string', enum: ['goods', 'rent', 'service'] },
        group_id: { type: 'string', format: 'uuid' },
        group: { type: 'object', description: 'GoodsCategory (group)' },
        item_id: { type: 'string', format: 'uuid' },
        item: { type: 'object', description: 'GoodsItem (subgroup via item.subcategory)' },
        price: { type: 'number' },
        status: { type: 'string', enum: ['pending', 'published', 'closed', 'canceled', 'blocked'] },
        owner: { type: 'object' },
        regions_data: { type: 'array' },
        villages_data: { type: 'array' },
        applications: { type: 'array' },
        images: { type: 'array', items: { type: 'string' } },
        description: { type: 'string' },
        created_at: { type: 'string', format: 'date-time' },
        updated_at: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid announcement ID (must be a valid UUID)' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string) {
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
        expiry_date: { type: 'string', format: 'date' },
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
    @UploadedFiles() files: { images?: any[] }, // Express.Multer.File[]
    @Request() req,
  ) {
    // Parse arrays and dates from multipart form data (support both snake_case and camelCase)
    const dateFromRaw = updateDto.date_from ?? updateDto.dateFrom;
    const dateToRaw = updateDto.date_to ?? updateDto.dateTo;
    const parsedDto: UpdateAnnouncementDto = {
      ...updateDto,
      date_from: typeof dateFromRaw === 'string' && dateFromRaw.trim() ? dateFromRaw.trim() : undefined,
      date_to: typeof dateToRaw === 'string' && dateToRaw.trim() ? dateToRaw.trim() : undefined,
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

    // Validate image files manually (more flexible than ParseFilePipe - checks both MIME type and extension)
    if (uploadedImages.length > 0) {
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      
      for (const file of uploadedImages) {
        const mimetype = file.mimetype?.toLowerCase() || '';
        const extension = file.originalname?.toLowerCase().substring(file.originalname.lastIndexOf('.')) || '';
        
        const isValidMimeType = allowedMimeTypes.includes(mimetype);
        const isValidExtension = allowedExtensions.includes(extension);
        
        if (!isValidMimeType && !isValidExtension) {
          this.logger.warn(`Invalid image file: ${file.originalname}, mimetype: ${mimetype}, extension: ${extension}`);
          throw new BadRequestException(
            `Invalid image file "${file.originalname}". ` +
            `MIME type: ${mimetype || 'unknown'}, extension: ${extension || 'none'}. ` +
            `Allowed types: JPEG, JPG, PNG, WebP. ` +
            `Allowed MIME types: ${allowedMimeTypes.join(', ')}`
          );
        }
      }
    }

    // Image update rules:
    // - If you send `images` (even empty): it becomes the exact final list (missing ones are removed)
    // - If you upload new files: they are appended to the provided `images` list (or replace all if `images` not provided)
    // - If you send neither `images` nor uploads: images stay unchanged
    const hasImagesInDto = Array.isArray(parsedDto.images);
    const shouldUpdateImages = hasImagesInDto || uploadedImages.length > 0;

    if (shouldUpdateImages) {
      const keepImages = hasImagesInDto
        ? (parsedDto.images || []).map((p) => this.normalizeStorageKey(p)).filter(Boolean)
        : [];
      const totalImageCount = keepImages.length + uploadedImages.length;
      if (totalImageCount > 3) {
        throw new BadRequestException(
          `Maximum 3 images allowed. You sent ${keepImages.length} existing image(s) and ${uploadedImages.length} new upload(s) (total: ${totalImageCount}).`
        );
      }
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
    const keepImages = Array.isArray(parsedDto.images)
      ? (parsedDto.images || []).map((p) => this.normalizeStorageKey(p)).filter(Boolean)
      : [];
    const allImagePaths = [...keepImages, ...newImagePaths];

    // Update announcement with image paths (not URLs)
    return this.announcementsService.update(
      id,
      {
        ...parsedDto,
        images: (Array.isArray(parsedDto.images) || newImagePaths.length > 0) ? allImagePaths : undefined,
      },
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
