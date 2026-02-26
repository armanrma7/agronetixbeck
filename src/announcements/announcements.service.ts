import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { 
  Announcement, 
  AnnouncementStatus, 
  AnnouncementCategory,
  AnnouncementType,
  Unit,
} from '../entities/announcement.entity';
import { User, UserType } from '../entities/user.entity';
import { GoodsCategory } from '../entities/goods-category.entity';
import { GoodsItem } from '../entities/goods-item.entity';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';
import { AnnouncementView } from '../entities/announcement-view.entity';
import { Application, ApplicationStatus } from '../entities/application.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { FcmService } from '../notifications/fcm.service';
import { DeviceTokenService } from '../notifications/device-token.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../entities/notification.entity';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectRepository(Announcement)
    private announcementRepository: Repository<Announcement>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(GoodsCategory)
    private categoryRepository: Repository<GoodsCategory>,
    @InjectRepository(GoodsItem)
    private itemRepository: Repository<GoodsItem>,
    @InjectRepository(Region)
    private regionRepository: Repository<Region>,
    @InjectRepository(Village)
    private villageRepository: Repository<Village>,
    @InjectRepository(AnnouncementView)
    private announcementViewRepository: Repository<AnnouncementView>,
    @InjectRepository(Application)
    private applicationRepository: Repository<Application>,
    private fcmService: FcmService,
    private deviceTokenService: DeviceTokenService,
    private notificationService: NotificationService,
    private storageService: StorageService,
    private configService: ConfigService,
  ) {}

  /**
   * Resolve applications count and data for an announcement
   */
  private async resolveApplications(announcement: Announcement): Promise<Announcement> {
    const applications = await this.applicationRepository.find({
      where: { announcement_id: announcement.id },
      relations: ['applicant'],
      select: {
        id: true,
        applicant_id: true,
        count: true,
        delivery_dates: true,
        notes: true,
        status: true,
        created_at: true,
        updated_at: true,
        applicant: {
          id: true,
          full_name: true,
        },
      },
      order: { created_at: 'DESC' },
      withDeleted: false,
    });

    // Attach applications count and data
    (announcement as any).applications_count = applications.length;
    (announcement as any).applications = applications;

    return announcement;
  }

  /**
   * Resolve applications count for multiple announcements
   */
  private async resolveApplicationsForAnnouncements(announcements: Announcement[]): Promise<Announcement[]> {
    if (announcements.length === 0) {
      return announcements;
    }

    const announcementIds = announcements.map(a => a.id);
    
    // Get all applications for these announcements
    const applications = await this.applicationRepository.find({
      where: { announcement_id: In(announcementIds) },
      relations: ['applicant'],
      select: {
        id: true,
        announcement_id: true,
        applicant_id: true,
        count: true,
        delivery_dates: true,
        notes: true,
        status: true,
        created_at: true,
        updated_at: true,
        applicant: {
          id: true,
          full_name: true,
        },
      },
      order: { created_at: 'DESC' },
      withDeleted: false,
    });

    // Group applications by announcement_id
    const applicationsByAnnouncement = new Map<string, Application[]>();
    for (const app of applications) {
      const apps = applicationsByAnnouncement.get(app.announcement_id) || [];
      apps.push(app);
      applicationsByAnnouncement.set(app.announcement_id, apps);
    }

    // Attach applications count and data to each announcement
    for (const announcement of announcements) {
      const apps = applicationsByAnnouncement.get(announcement.id) || [];
      (announcement as any).applications_count = apps.length;
      (announcement as any).applications = apps;
    }

    return announcements;
  }

  /**
   * Resolve region and village names from UUID arrays
   */
  private async resolveRegionsAndVillages(announcement: Announcement): Promise<Announcement> {
    // Resolve regions if they exist
    if (announcement.regions && announcement.regions.length > 0) {
      const regions = await this.regionRepository.find({
        where: { id: In(announcement.regions) },
        select: ['id', 'name_am', 'name_en', 'name_ru'],
      });
      
      // Attach regions with names to announcement
      (announcement as any).regions_data = regions.map(region => ({
        id: region.id,
        name_am: region.name_am,
        name_en: region.name_en,
        name_ru: region.name_ru,
      }));
    } else {
      (announcement as any).regions_data = [];
    }

    // Resolve villages if they exist
    if (announcement.villages && announcement.villages.length > 0) {
      const villages = await this.villageRepository.find({
        where: { id: In(announcement.villages) },
        select: ['id', 'name_am', 'name_en', 'name_ru'],
      });
      
      // Attach villages with names to announcement
      (announcement as any).villages_data = villages.map(village => ({
        id: village.id,
        name_am: village.name_am,
        name_en: village.name_en,
        name_ru: village.name_ru,
      }));
    } else {
      (announcement as any).villages_data = [];
    }

    return announcement;
  }

  /**
   * Enrich announcement with signed URLs for images.
   * Converts stored file paths (keys) to signed URLs.
   * Automatically removes orphaned image paths (deleted from storage) from the DB record.
   */
  private async enrichWithSignedUrls(announcement: Announcement): Promise<Announcement> {
    if (announcement.images && announcement.images.length > 0) {
      const { signedUrls, orphanedPaths } = await this.storageService.getSignedUrlsWithOrphans(
        announcement.images,
      );

      // Fire-and-forget: clean up orphaned paths from the DB so we stop logging them
      if (orphanedPaths.length > 0) {
        this.logger.warn(
          `Removing ${orphanedPaths.length} orphaned image path(s) from announcement ${announcement.id}: ${orphanedPaths.join(', ')}`,
        );
        const cleanedImages = announcement.images.filter((p) => !orphanedPaths.includes(p));
        this.announcementRepository
          .update(announcement.id, { images: cleanedImages })
          .catch((err) =>
            this.logger.error(`Failed to clean up orphaned images for ${announcement.id}: ${err.message}`),
          );
      }

      return {
        ...announcement,
        images: signedUrls,
      };
    }
    return announcement;
  }

  /**
   * Enrich multiple announcements with signed URLs
   */
  private async enrichAnnouncementsWithSignedUrls(announcements: Announcement[]): Promise<Announcement[]> {
    const enrichedPromises = announcements.map(async (announcement) => {
      const withUrls = await this.enrichWithSignedUrls(announcement);
      return this.resolveRegionsAndVillages(withUrls);
    });
    return Promise.all(enrichedPromises);
  }

  /**
   * Safely parse a date string to Date object (for PostgreSQL DATE type)
   * Ensures dates are parsed correctly and time is set to midnight UTC
   */
  private parseDate(dateString: string | undefined | null): Date | null {
    if (!dateString || !dateString.trim()) {
      return null;
    }
    
    // Parse YYYY-MM-DD format explicitly
    const dateMatch = dateString.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      throw new BadRequestException(`Invalid date format: "${dateString}". Use YYYY-MM-DD format.`);
    }
    
    const [, year, month, day] = dateMatch;
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10) - 1; // JavaScript months are 0-indexed
    const dayNum = parseInt(day, 10);
    
    // Create date at midnight UTC to avoid timezone issues
    const date = new Date(Date.UTC(yearNum, monthNum, dayNum));
    
    // Validate the date is valid (e.g., not 2026-13-45)
    if (
      date.getUTCFullYear() !== yearNum ||
      date.getUTCMonth() !== monthNum ||
      date.getUTCDate() !== dayNum
    ) {
      throw new BadRequestException(`Invalid date: "${dateString}". Date does not exist.`);
    }
    
    return date;
  }

  /**
   * Check if user can create announcements
   */
  private validateUserCanCreate(user: User): void {
    if (!user.verified) {
      throw new ForbiddenException(
        'You cannot create a new Announcement as your account is not verified'
      );
    }

    if (user.is_locked || user.account_status === 'blocked') {
      throw new ForbiddenException('Your account is blocked or deactivated');
    }

    if (user.user_type !== UserType.FARMER && user.user_type !== UserType.COMPANY) {
      throw new ForbiddenException('Only Farmers and Companies can create announcements');
    }
  }

  /**
   * Validate category-specific required fields
   */
  private validateCategoryFields(dto: CreateAnnouncementDto): void {
    if (dto.category === AnnouncementCategory.GOODS) {
      if (!dto.count || dto.count <= 0) {
        throw new BadRequestException('count is required and must be > 0 for goods category');
      }
      // daily_limit is optional, but if provided, must be valid
      if (dto.daily_limit && dto.daily_limit > dto.count) {
        throw new BadRequestException('daily_limit cannot exceed count');
      }
    }

    if (dto.category === AnnouncementCategory.RENT) {
      if (!dto.date_from || !dto.date_from.trim()) {
        throw new BadRequestException('date_from is required for rent category');
      }
      if (!dto.date_to || !dto.date_to.trim()) {
        throw new BadRequestException('date_to is required for rent category');
      }
      
      const dateFrom = this.parseDate(dto.date_from);
      const dateTo = this.parseDate(dto.date_to);
      
      if (!dateFrom || !dateTo) {
        throw new BadRequestException('Both date_from and date_to are required for rent category');
      }
      
      if (dateFrom >= dateTo) {
        throw new BadRequestException('date_from must be before date_to');
      }
    }
  }

  /**
   * Determine initial status: only goods can be auto-published (when no description/images).
   * Rent and service always start as PENDING (require admin verification).
   */
  private determineInitialStatus(
    category: AnnouncementCategory,
    description?: string,
    images?: string[]
  ): AnnouncementStatus {
    // Rent and service always pending until admin publishes
    if (category === AnnouncementCategory.RENT || category === AnnouncementCategory.SERVICE) {
      return AnnouncementStatus.PENDING;
    }
    // Goods: if description or images exist, needs verification
    if (description || (images && images.length > 0)) {
      return AnnouncementStatus.PENDING;
    }
    // Goods only: auto-publish when no description or images
    return AnnouncementStatus.PUBLISHED;
  }

  /**
   * Generate short summary from announcement
   */
  generateSummary(announcement: Announcement): string {
    const parts: string[] = [];

    // Add type and category
    parts.push(`${announcement.type} ${announcement.category}`);

    // Add item name if available
    if (announcement.item) {
      parts.push(announcement.item.name_en || announcement.item.name_am);
    }

    // Add count for goods
    if (announcement.category === AnnouncementCategory.GOODS && announcement.count) {
      parts.push(`${announcement.count} ${announcement.unit || 'units'}`);
    }

    // Add price
    parts.push(`${announcement.price} AMD`);

    // Add description snippet if available
    if (announcement.description) {
      const descSnippet = announcement.description.substring(0, 50);
      if (descSnippet.length < announcement.description.length) {
        parts.push(`${descSnippet}...`);
      } else {
        parts.push(descSnippet);
      }
    }

    return parts.join(' - ');
  }

  /**
   * Helper method to send FCM notification to a user
   */
  private async sendNotificationToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ) {
    try {
      const tokens = await this.deviceTokenService.getActiveTokensForUser(userId);
      if (tokens.length > 0) {
        await this.fcmService.sendToDevices(tokens, {
          title,
          body,
          data,
        });
      }
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${userId}: ${error.message}`);
    }
  }

  /**
   * Create a new announcement
   */
  async create(
    createDto: CreateAnnouncementDto,
    userId: string
  ): Promise<{ message: string; announcement: Announcement }> {
    // Validate user
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.validateUserCanCreate(user);

    // Validate category-specific fields
    this.validateCategoryFields(createDto);

    // Validate catalog references exist
    const category = await this.categoryRepository.findOne({ 
      where: { id: createDto.group_id } 
    });
    if (!category) {
      throw new BadRequestException(`Category with ID ${createDto.group_id} not found`);
    }

    const item = await this.itemRepository.findOne({ 
      where: { id: createDto.item_id } 
    });
    if (!item) {
      throw new BadRequestException(`Item with ID ${createDto.item_id} not found`);
    }

    // Determine initial status (only goods can be auto-published; rent/service always pending)
    const status = this.determineInitialStatus(createDto.category, createDto.description, createDto.images);

    // Expiry date: use end date (date_to) when present, otherwise default expiry days if configured
    let expiryDate: Date | null = null;
    if (createDto.date_to) {
      expiryDate = this.parseDate(createDto.date_to);
    } else {
      const defaultExpiryDays = this.configService.get<number>('ANNOUNCEMENT_DEFAULT_EXPIRY_DAYS');
      if (defaultExpiryDays && defaultExpiryDays > 0) {
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + defaultExpiryDays);
        expiry.setHours(0, 0, 0, 0);
        expiryDate = expiry;
      }
    }

    // Create announcement
    // Ensure NULL values are explicitly set for non-applicable fields
    const announcement = this.announcementRepository.create({
      type: createDto.type,
      category: createDto.category,
      group_id: createDto.group_id,
      item_id: createDto.item_id,
      price: createDto.price,
      description: createDto.description,
      owner_id: userId,
      status,
      // For goods: count required, others: NULL
      count: createDto.category === AnnouncementCategory.GOODS ? createDto.count : null,
      // For goods: daily_limit optional, others: NULL
      daily_limit: createDto.category === AnnouncementCategory.GOODS ? (createDto.daily_limit || null) : null,
      unit: createDto.unit || null,
      images: createDto.images || [],
      // date_from / date_to: use when provided (required for rent, optional for others)
      date_from: createDto.date_from ? this.parseDate(createDto.date_from) : null,
      date_to: createDto.date_to ? this.parseDate(createDto.date_to) : null,
      min_area: createDto.min_area || null,
      regions: createDto.regions || [],
      villages: createDto.villages || [],
      available_quantity: createDto.category === AnnouncementCategory.GOODS ? (createDto.count || 0) : 0,
      expiry_date: expiryDate,
    });

    const savedAnnouncement = await this.announcementRepository.save(announcement);

    // Load relations for response
    const fullAnnouncement = await this.findOne(savedAnnouncement.id);

    const message =
      status === AnnouncementStatus.PENDING
        ? 'Your Announcement was successfully submitted for verification'
        : 'Your Announcement is published and ready to receive applications';

    return { message, announcement: fullAnnouncement };
  }

  /**
   * Get all announcements (with filters)
   * Excludes announcements owned by excludeOwnerId if provided
   */
  async findAll(params: {
    category?: string[];
    type?: string;
    status?: AnnouncementStatus;
    group_id?: string[];
    subgroup_id?: string[];
    regions?: string[];
    villages?: string[];
    price_from?: number;
    price_to?: number;
    created_from?: string;
    created_to?: string;
    page?: number;
    limit?: number;
    excludeOwnerId?: string;
  }): Promise<{ announcements: Announcement[]; total: number; page: number; limit: number }> {
    // Validate status enum if provided
    if (params.status) {
      const validStatuses = Object.values(AnnouncementStatus);
      if (!validStatuses.includes(params.status)) {
        throw new BadRequestException(
          `Invalid status value: "${params.status}". Valid values are: ${validStatuses.join(', ')}`
        );
      }
    }

    const queryBuilder = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoin('announcement.owner', 'owner')
      .leftJoin('announcement.group', 'group')
      .leftJoin('announcement.item', 'item')
      // Explicitly select owner_id to ensure it's returned
      .addSelect('announcement.owner_id')
      // Select only safe fields from owner (exclude sensitive data)
      .addSelect([
        'owner.id',
        'owner.full_name',
      ])
      // Select only id and name fields from group
      .addSelect([
        'group.id',
        'group.name_am',
        'group.name_en',
        'group.name_ru',
      ])
      // Select only id, name, and measurements from item
      .addSelect([
        'item.id',
        'item.name_am',
        'item.name_en',
        'item.name_ru',
        'item.measurements',
      ]);

    // Default to published if no status specified
    if (params.status) {
      queryBuilder.andWhere('announcement.status = :status', {
        status: params.status,
      });
    } else {
      queryBuilder.andWhere('announcement.status = :status', {
        status: AnnouncementStatus.PUBLISHED,
      });
    }

    // Filter by category (one or many: match any)
    if (params.category && params.category.length > 0) {
      queryBuilder.andWhere('announcement.category IN (:...categories)', {
        categories: params.category,
      });
    }

    if (params.type) {
      queryBuilder.andWhere('announcement.type = :type', {
        type: params.type,
      });
    }

    // Filter by group (GoodsCategory) — one or many: match any
    if (params.group_id && params.group_id.length > 0) {
      queryBuilder.andWhere('announcement.group_id IN (:...group_ids)', {
        group_ids: params.group_id,
      });
    }

    // Filter by subgroup (GoodsSubcategory) — one or many: match any
    if (params.subgroup_id && params.subgroup_id.length > 0) {
      queryBuilder.andWhere('item.subcategory_id IN (:...subgroup_ids)', {
        subgroup_ids: params.subgroup_id,
      });
    }

    // Apply region filter (array overlap - announcement.regions overlaps with filter regions)
    if (params.regions && params.regions.length > 0) {
      queryBuilder.andWhere('announcement.regions && :regions', {
        regions: params.regions,
      });
    }

    // Apply village filter (array overlap - announcement.villages overlaps with filter villages)
    if (params.villages && params.villages.length > 0) {
      queryBuilder.andWhere('announcement.villages && :villages', {
        villages: params.villages,
      });
    }

    // Filter by price range
    if (params.price_from != null) {
      queryBuilder.andWhere('announcement.price >= :price_from', {
        price_from: Number(params.price_from),
      });
    }
    if (params.price_to != null) {
      queryBuilder.andWhere('announcement.price <= :price_to', {
        price_to: Number(params.price_to),
      });
    }

    // Apply created_from filter
    if (params.created_from) {
      const fromDate = new Date(params.created_from);
      fromDate.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('announcement.created_at >= :created_from', {
        created_from: fromDate,
      });
    }

    // Apply created_to filter
    if (params.created_to) {
      const toDate = new Date(params.created_to);
      toDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('announcement.created_at <= :created_to', {
        created_to: toDate,
      });
    }

    // Exclude current user's announcements if excludeOwnerId is provided
    if (params.excludeOwnerId) {
      queryBuilder.andWhere('announcement.owner_id != :excludeOwnerId', {
        excludeOwnerId: params.excludeOwnerId,
      });
    }

    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    queryBuilder.skip(skip).take(limit).orderBy('announcement.created_at', 'DESC');

    const [announcements, total] = await queryBuilder.getManyAndCount();

    // Enrich with signed URLs and resolve regions/villages names
    const enrichedAnnouncements = await this.enrichAnnouncementsWithSignedUrls(announcements);
    
    // Resolve applications count and data for each announcement
    const withApplications = await this.resolveApplicationsForAnnouncements(enrichedAnnouncements);

    return {
      announcements: withApplications,
      total,
      page,
      limit,
    };
  }

  /**
   * Search published announcements by text (description + item/group names).
   * Fast: single query, minimal selects, no applications/regions. Use for search-as-you-type.
   */
  async search(params: {
    q: string;
    page?: number;
    limit?: number;
    excludeOwnerId?: string;
  }): Promise<{ announcements: Announcement[]; total: number; page: number; limit: number }> {
    const trimmed = (params.q || '').trim();
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 20));
    const skip = (page - 1) * limit;

    if (!trimmed) {
      return { announcements: [], total: 0, page, limit };
    }

    const pattern = `%${trimmed.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;

    const qb = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoin('announcement.owner', 'owner')
      .leftJoin('announcement.group', 'group')
      .leftJoin('announcement.item', 'item')
      .addSelect('announcement.owner_id')
      .addSelect(['owner.id', 'owner.full_name'])
      .addSelect(['group.id', 'group.name_am', 'group.name_en', 'group.name_ru'])
      .addSelect(['item.id', 'item.name_am', 'item.name_en', 'item.name_ru'])
      .where('announcement.status = :status', { status: AnnouncementStatus.PUBLISHED })
      .andWhere(
        '(announcement.description ILIKE :pattern ESCAPE \'\\\\\' OR item.name_en ILIKE :pattern ESCAPE \'\\\\\' OR item.name_am ILIKE :pattern ESCAPE \'\\\\\' OR item.name_ru ILIKE :pattern ESCAPE \'\\\\\' OR group.name_en ILIKE :pattern ESCAPE \'\\\\\' OR group.name_am ILIKE :pattern ESCAPE \'\\\\\' OR group.name_ru ILIKE :pattern ESCAPE \'\\\\\')',
        { pattern },
      );

    if (params.excludeOwnerId) {
      qb.andWhere('announcement.owner_id != :excludeOwnerId', {
        excludeOwnerId: params.excludeOwnerId,
      });
    }

    const [announcements, total] = await qb
      .orderBy('announcement.created_at', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const enriched = await this.enrichAnnouncementsWithSignedUrls(announcements);
    return { announcements: enriched, total, page, limit };
  }

  /**
   * Get announcement by ID
   */
  async findOne(id: string): Promise<Announcement> {
    const announcement = await this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoin('announcement.owner', 'owner')
      .leftJoin('owner.region', 'ownerRegion')
      .leftJoin('owner.village', 'ownerVillage')
      .leftJoin('announcement.group', 'group')
      .leftJoin('announcement.item', 'item')
      .leftJoin('announcement.closedByUser', 'closedByUser')
      // Explicitly select owner_id to ensure it's returned
      .addSelect('announcement.owner_id')
      // Select only safe fields from owner (exclude sensitive data) + region/village ids + phone
      .addSelect([
        'owner.id',
        'owner.full_name',
        'owner.phone',
        'owner.region_id',
        'owner.village_id',
      ])
      // Owner's region (id + names)
      .addSelect(['ownerRegion.id', 'ownerRegion.name_am', 'ownerRegion.name_en', 'ownerRegion.name_ru'])
      // Owner's village (id + names)
      .addSelect(['ownerVillage.id', 'ownerVillage.name_am', 'ownerVillage.name_en', 'ownerVillage.name_ru'])
      // Select only id and name fields from group
      .addSelect([
        'group.id',
        'group.name_am',
        'group.name_en',
        'group.name_ru',
      ])
      // Select only id, name, and measurements from item
      .addSelect([
        'item.id',
        'item.name_am',
        'item.name_en',
        'item.name_ru',
        'item.measurements',
      ])
      // Select only safe fields from closedByUser
      .addSelect([
        'closedByUser.id',
        'closedByUser.full_name',
      ])
      .where('announcement.id = :id', { id })
      .getOne();

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${id} not found`);
    }

    // Enrich with signed URLs and resolve regions/villages
    const withUrls = await this.enrichWithSignedUrls(announcement);
    const withRegions = await this.resolveRegionsAndVillages(withUrls);
    
    // Resolve applications count and data
    return this.resolveApplications(withRegions);
  }

  /**
   * Get user's own announcements with filters and pagination
   * Only returns announcements owned by the specified user (security enforced)
   */
  async findUserAnnouncements(
    userId: string,
    filters?: {
      status?: AnnouncementStatus;
      category?: string[];
      group_id?: string[];
      subgroup_id?: string[];
      regions?: string[];
      villages?: string[];
      price_from?: number;
      price_to?: number;
      created_from?: string;
      created_to?: string;
      page?: number;
      limit?: number;
    }
  ): Promise<{ announcements: Announcement[]; total: number; page: number; limit: number }> {
    const queryBuilder = this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoin('announcement.owner', 'owner')
      .leftJoin('announcement.group', 'group')
      .leftJoin('announcement.item', 'item')
      // Explicitly select owner_id to ensure it's returned and verify ownership
      .addSelect('announcement.owner_id')
      // Select only safe fields from owner (exclude sensitive data)
      .addSelect([
        'owner.id',
        'owner.full_name',
      ])
      // Select only id and name fields from group
      .addSelect([
        'group.id',
        'group.name_am',
        'group.name_en',
        'group.name_ru',
      ])
      // Select only id, name, and measurements from item
      .addSelect([
        'item.id',
        'item.name_am',
        'item.name_en',
        'item.name_ru',
        'item.measurements',
      ])
      // CRITICAL: Only return announcements owned by this user
      .where('announcement.owner_id = :userId', { userId });

    // Apply status filter
    if (filters?.status) {
      queryBuilder.andWhere('announcement.status = :status', {
        status: filters.status,
      });
    }

    // Filter by category (one or many)
    if (filters?.category && filters.category.length > 0) {
      queryBuilder.andWhere('announcement.category IN (:...categories)', {
        categories: filters.category,
      });
    }

    // Filter by group (GoodsCategory) — one or many
    if (filters?.group_id && filters.group_id.length > 0) {
      queryBuilder.andWhere('announcement.group_id IN (:...group_ids)', {
        group_ids: filters.group_id,
      });
    }

    // Filter by subgroup (GoodsSubcategory) — one or many
    if (filters?.subgroup_id && filters.subgroup_id.length > 0) {
      queryBuilder.andWhere('item.subcategory_id IN (:...subgroup_ids)', {
        subgroup_ids: filters.subgroup_id,
      });
    }

    // Apply region filter (array overlap - announcement.regions overlaps with filter regions)
    if (filters?.regions && filters.regions.length > 0) {
      queryBuilder.andWhere('announcement.regions && :regions', {
        regions: filters.regions,
      });
    }

    // Apply village filter (array overlap - announcement.villages overlaps with filter villages)
    if (filters?.villages && filters.villages.length > 0) {
      queryBuilder.andWhere('announcement.villages && :villages', {
        villages: filters.villages,
      });
    }

    // Filter by price range
    if (filters?.price_from != null) {
      queryBuilder.andWhere('announcement.price >= :price_from', {
        price_from: Number(filters.price_from),
      });
    }
    if (filters?.price_to != null) {
      queryBuilder.andWhere('announcement.price <= :price_to', {
        price_to: Number(filters.price_to),
      });
    }

    // Apply created_from filter
    if (filters?.created_from) {
      const fromDate = new Date(filters.created_from);
      fromDate.setHours(0, 0, 0, 0);
      queryBuilder.andWhere('announcement.created_at >= :created_from', {
        created_from: fromDate,
      });
    }

    // Apply created_to filter
    if (filters?.created_to) {
      const toDate = new Date(filters.created_to);
      toDate.setHours(23, 59, 59, 999);
      queryBuilder.andWhere('announcement.created_at <= :created_to', {
        created_to: toDate,
      });
    }

    // Pagination
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    queryBuilder
      .orderBy('announcement.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    // Get paginated results and total count in parallel
    const [announcements, total] = await queryBuilder.getManyAndCount();

    // Enrich with signed URLs and resolve regions/villages names
    const enrichedAnnouncements = await this.enrichAnnouncementsWithSignedUrls(announcements);
    
    // Resolve applications count and data for each announcement (batch query - already optimized)
    const withApplications = await this.resolveApplicationsForAnnouncements(enrichedAnnouncements);

    return {
      announcements: withApplications,
      total,
      page,
      limit,
    };
  }

  /**
   * Get announcements where the user has applied (created applications)
   * Returns only the user's own applications, not all applications
   */
  async findAnnouncementsWithMyApplications(userId: string): Promise<Announcement[]> {
    // First, get all applications created by the user with announcement details
    const userApplications = await this.applicationRepository.find({
      where: { applicant_id: userId },
      relations: ['announcement', 'announcement.owner', 'announcement.group', 'announcement.item'],
      select: {
        id: true,
        applicant_id: true,
        announcement_id: true,
        count: true,
        delivery_dates: true,
        notes: true,
        status: true,
        created_at: true,
        updated_at: true,
        announcement: {
          id: true,
          type: true,
          category: true,
          group_id: true,
          item_id: true,
          price: true,
          description: true,
          owner_id: true,
          status: true,
          count: true,
          daily_limit: true,
          available_quantity: true,
          unit: true,
          images: true,
          date_from: true,
          date_to: true,
          min_area: true,
          regions: true,
          villages: true,
          views_count: true,
          created_at: true,
          updated_at: true,
        },
      },
      order: { created_at: 'DESC' },
      withDeleted: false,
    });

    if (userApplications.length === 0) {
      return [];
    }

    // Group applications by announcement_id
    const announcementsMap = new Map<string, {
      announcement: Announcement;
      myApplications: Application[];
    }>();

    for (const application of userApplications) {
      const announcementId = application.announcement_id;
      
      if (!announcementsMap.has(announcementId)) {
        announcementsMap.set(announcementId, {
          announcement: application.announcement,
          myApplications: [],
        });
      }
      
      announcementsMap.get(announcementId)!.myApplications.push(application);
    }

    // Convert map to array and enrich announcements
    const announcements = Array.from(announcementsMap.values()).map(({ announcement, myApplications }) => {
      // Enrich with signed URLs and resolve regions/villages
      const enriched = {
        ...announcement,
        my_applications: myApplications,
        my_applications_count: myApplications.length,
      };
      
      return enriched;
    });

    // Enrich all announcements with signed URLs and regions/villages
    const enrichedAnnouncements = await this.enrichAnnouncementsWithSignedUrls(announcements);
    const withRegions = await Promise.all(
      enrichedAnnouncements.map(ann => this.resolveRegionsAndVillages(ann))
    );

    return withRegions;
  }

  /**
   * Update announcement
   */
  async update(
    id: string,
    updateDto: UpdateAnnouncementDto,
    userId: string,
    userType?: string
  ): Promise<Announcement> {
    const announcement = await this.findOne(id);

    // Check ownership (admins can update any announcement)
    const isAdmin = userType === UserType.ADMIN;
    if (!isAdmin && announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only update your own announcements');
    }

    // Update rules:
    // - Published (non-admin): owner can ONLY update expiry_date
    // - Pending: owner can update ALL fields (including expiry_date)
    // - Admin: can update anything regardless of status
    if (!isAdmin && announcement.status === AnnouncementStatus.PUBLISHED) {
      const allowedFields = ['expiry_date'];
      const updateFields = Object.keys(updateDto).filter(key => updateDto[key] !== undefined);
      const disallowedFields = updateFields.filter(field => !allowedFields.includes(field));
      if (disallowedFields.length > 0) {
        throw new ForbiddenException(
          `Cannot update published announcements. Only expiry_date can be updated. Attempted to update: ${disallowedFields.join(', ')}`
        );
      }
    }

    // Validate date range if updating rent dates
    if (updateDto.date_from !== undefined || updateDto.date_to !== undefined) {
      const dateFrom = updateDto.date_from !== undefined 
        ? this.parseDate(updateDto.date_from) 
        : announcement.date_from;
      const dateTo = updateDto.date_to !== undefined 
        ? this.parseDate(updateDto.date_to) 
        : announcement.date_to;
      
      if (dateFrom && dateTo && dateFrom >= dateTo) {
        throw new BadRequestException('date_from must be before date_to');
      }
    }

    // Validate daily_limit vs count if updating goods
    if (updateDto.daily_limit && announcement.category === AnnouncementCategory.GOODS) {
      const newCount = updateDto.count || announcement.count;
      if (updateDto.daily_limit > newCount) {
        throw new BadRequestException('daily_limit cannot exceed count');
      }
    }

    // Status should not be updated via this endpoint
    // Use dedicated endpoints: publish, block, close, cancel
    if (updateDto.status !== undefined) {
      // Validate status enum value if provided
      const validStatuses = Object.values(AnnouncementStatus);
      if (!validStatuses.includes(updateDto.status)) {
        throw new BadRequestException(
          `Invalid status value: "${updateDto.status}". Valid values are: ${validStatuses.join(', ')}. ` +
          `Status cannot be updated via this endpoint. Use dedicated endpoints: /publish, /block, /close, /cancel`
        );
      }
      throw new BadRequestException(
        'Status cannot be updated via this endpoint. Use dedicated endpoints: /publish, /block, /close, /cancel'
      );
    }

    // Handle image deletion: delete images from storage that are being removed
    const oldImages = announcement.images || [];
    const newImages = updateDto.images || [];
    if (updateDto.images !== undefined) {
      const imagesToDelete = oldImages.filter(img => !newImages.includes(img));
      if (imagesToDelete.length > 0) {
        this.logger.log(`Deleting ${imagesToDelete.length} removed image(s) from storage for announcement ${id}`);
        try {
          await this.storageService.deleteImages(imagesToDelete);
        } catch (error) {
          this.logger.warn(`Failed to delete some images from storage: ${error.message}`);
          // Don't throw - continue with update even if deletion fails
        }
      }
    }

    // Update fields
    const updatedFields: any = { ...updateDto };
    
    // Remove status from update fields (should not be updated here)
    delete updatedFields.status;
    
    // Handle date fields safely
    if (updateDto.date_from !== undefined) {
      updatedFields.date_from = this.parseDate(updateDto.date_from);
    }
    
    if (updateDto.date_to !== undefined) {
      const dateTo = this.parseDate(updateDto.date_to);
      updatedFields.date_to = dateTo;
      // Use end date as expiry date for rent (and any announcement with date_to)
      if (announcement.category === AnnouncementCategory.RENT) {
        updatedFields.expiry_date = dateTo;
      }
    }

    if (updateDto.expiry_date !== undefined) {
      updatedFields.expiry_date = this.parseDate(updateDto.expiry_date);
    }
    
    Object.assign(announcement, updatedFields);

    try {
      const savedAnnouncement = await this.announcementRepository.save(announcement);
      
      // Reload with relations and enrich with signed URLs
      const fullAnnouncement = await this.findOne(savedAnnouncement.id);
      return fullAnnouncement;
    } catch (error) {
      // Catch enum validation errors and provide a better error message
      if (error.message && error.message.includes('invalid input value for enum')) {
        const enumMatch = error.message.match(/enum (\w+_enum): "([^"]+)"/);
        if (enumMatch) {
          const enumName = enumMatch[1];
          const invalidValue = enumMatch[2];
          
          // Map enum names to valid values
          const enumValueMap: Record<string, string[]> = {
            'announcement_status_enum': Object.values(AnnouncementStatus),
            'announcement_type_enum': Object.values(AnnouncementType),
            'announcement_category_enum': Object.values(AnnouncementCategory),
            'announcement_unit_enum': Object.values(Unit),
          };
          
          const validValues = enumValueMap[enumName] || [];
          throw new BadRequestException(
            `Invalid value "${invalidValue}" for ${enumName}. Valid values are: ${validValues.join(', ')}`
          );
        }
      }
      throw error;
    }
    
    // Reload with relations and enrich with signed URLs
    const fullAnnouncement = await this.findOne(announcement.id);
    return fullAnnouncement;
  }

  /**
   * Publish announcement (admin action)
   */
  async publish(id: string, adminId: string): Promise<Announcement> {
    const announcement = await this.findOne(id);

    if (announcement.status !== AnnouncementStatus.PENDING) {
      throw new BadRequestException('Only pending announcements can be published');
    }

    announcement.status = AnnouncementStatus.PUBLISHED;
    await this.announcementRepository.save(announcement);

    // Notify owner (creates DB record + push notification)
    try {
      await this.notificationService.create({
        user_id: announcement.owner_id,
        type: NotificationType.ANNOUNCEMENT_PUBLISHED,
        title: 'Announcement Published',
        body: `Your announcement "${this.generateSummary(announcement)}" has been approved and published.`,
        data: {
          announcement_id: announcement.id,
          announcement_type: announcement.type,
          announcement_category: announcement.category,
        },
        sendPush: true,
      });
    } catch (error) {
      this.logger.warn(`Failed to notify owner about published announcement ${announcement.id}: ${error.message}`);
      // Don't throw - continue with region notifications
    }

    // Notify users in matching regions about the new announcement
    await this.notifyUsersInRegions(announcement);

    // Return enriched announcement
    return this.findOne(id);
  }

  /**
   * Notify users in matching regions about a newly published announcement
   * Excludes the announcement owner
   */
  private async notifyUsersInRegions(announcement: Announcement): Promise<void> {
    // Only notify if announcement has regions
    if (!announcement.regions || announcement.regions.length === 0) {
      this.logger.log(`Announcement ${announcement.id} has no regions, skipping region notifications`);
      return;
    }

    try {
      // Find users whose region_id matches any of the announcement's regions
      // Exclude the announcement owner
      const usersInRegions = await this.userRepository.find({
        where: {
          region_id: In(announcement.regions),
          verified: true, // Only notify verified users
          is_locked: false, // Don't notify locked users
        },
        select: ['id', 'full_name', 'region_id'],
      });

      // Filter out the announcement owner
      const usersToNotify = usersInRegions.filter(user => user.id !== announcement.owner_id);

      if (usersToNotify.length === 0) {
        this.logger.log(`No users found in regions ${announcement.regions.join(', ')} to notify`);
        return;
      }

      this.logger.log(
        `Notifying ${usersToNotify.length} user(s) in regions ${announcement.regions.join(', ')} about announcement ${announcement.id}`
      );

      // Generate announcement summary for notification
      const itemName = announcement.item?.name_en || announcement.item?.name_am || 'item';
      const categoryName = announcement.category === AnnouncementCategory.GOODS ? 'goods' :
                          announcement.category === AnnouncementCategory.RENT ? 'rent' : 'service';
      const typeName = announcement.type === AnnouncementType.SELL ? 'sell' : 'buy';

      // Send notifications to all matching users
      const notificationPromises = usersToNotify.map(user =>
        this.notificationService.create({
          user_id: user.id,
          type: NotificationType.ANNOUNCEMENT_PUBLISHED,
          title: 'New Announcement in Your Region',
          body: `New ${typeName} ${categoryName} announcement: ${itemName} - ${announcement.price} AMD`,
          data: {
            announcement_id: announcement.id,
            announcement_type: announcement.type,
            announcement_category: announcement.category,
            region_ids: announcement.regions,
          },
          sendPush: true,
        }).catch(error => {
          this.logger.warn(`Failed to notify user ${user.id} about announcement ${announcement.id}: ${error.message}`);
          return null;
        })
      );

      const results = await Promise.allSettled(notificationPromises);
      const successCount = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
      const failureCount = results.length - successCount;

      this.logger.log(
        `Region notifications sent: ${successCount} successful, ${failureCount} failed for announcement ${announcement.id}`
      );
    } catch (error) {
      this.logger.error(
        `Failed to send region notifications for announcement ${announcement.id}: ${error.message}`,
        error.stack
      );
      // Don't throw - announcement is already published
    }
  }

  /**
   * Block announcement (admin action)
   */
  async block(id: string, adminId: string): Promise<Announcement> {
    const announcement = await this.findOne(id);

    announcement.status = AnnouncementStatus.BLOCKED;
    announcement.closed_by = adminId;
    await this.announcementRepository.save(announcement);

    // Notify owner
    await this.sendNotificationToUser(
      announcement.owner_id,
      'Announcement Blocked',
      `Your announcement "${this.generateSummary(announcement)}" has been blocked by an administrator.`,
      { announcementId: announcement.id }
    );

    // Return enriched announcement
    return this.findOne(id);
  }

  /**
   * Close announcement (owner or admin action)
   */
  async close(id: string, closedBy: string): Promise<Announcement> {
    const announcement = await this.findOne(id);

    if (announcement.status === AnnouncementStatus.CLOSED) {
      throw new BadRequestException('Announcement is already closed');
    }

    announcement.status = AnnouncementStatus.CLOSED;
    announcement.closed_by = closedBy;
    await this.announcementRepository.save(announcement);

    // Return enriched announcement
    return this.findOne(id);
  }

  /**
   * Cancel announcement (owner action)
   */
  async cancel(id: string, userId: string): Promise<Announcement> {
    const announcement = await this.findOne(id);

    // Check ownership
    if (announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only cancel your own announcements');
    }

    // Check if already published
    const wasPublished = announcement.status === AnnouncementStatus.PUBLISHED;

    if (!wasPublished && announcement.status !== AnnouncementStatus.PENDING) {
      throw new BadRequestException(
        'Only pending or published announcements can be canceled'
      );
    }

    announcement.status = AnnouncementStatus.CANCELED;
    await this.announcementRepository.save(announcement);

    // Delete images from storage when announcement is canceled
    if (announcement.images && announcement.images.length > 0) {
      this.logger.log(`Deleting ${announcement.images.length} image(s) from storage for canceled announcement ${id}`);
      try {
        await this.storageService.deleteImages(announcement.images);
      } catch (error) {
        this.logger.warn(`Failed to delete images from storage: ${error.message}`);
        // Don't throw - continue even if deletion fails
      }
    }

    // If it was published, notify applicants (if applications module is integrated)
    if (wasPublished) {
      this.logger.log(`Published announcement ${id} was canceled by owner`);
      // TODO: Notify applicants if applications exist
    }

    // Return enriched announcement
    return this.findOne(id);
  }

  /**
   * Delete announcement (soft delete by marking as canceled)
   */
  async remove(id: string, userId: string): Promise<void> {
    const announcement = await this.findOne(id);

    // Check ownership
    if (announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only delete your own announcements');
    }

    // Only allow deleting non-published announcements
    if (announcement.status === AnnouncementStatus.PUBLISHED) {
      throw new ForbiddenException('Cannot delete published announcements. Please cancel it first.');
    }

    // Soft delete
    announcement.status = AnnouncementStatus.CANCELED;
    await this.announcementRepository.save(announcement);

    // Delete images from storage when announcement is deleted
    if (announcement.images && announcement.images.length > 0) {
      this.logger.log(`Deleting ${announcement.images.length} image(s) from storage for deleted announcement ${id}`);
      try {
        await this.storageService.deleteImages(announcement.images);
      } catch (error) {
        this.logger.warn(`Failed to delete images from storage: ${error.message}`);
        // Don't throw - continue even if deletion fails
      }
    }
  }

  /**
   * Record a view for an announcement
   * One user can only count as one view per announcement
   * Owner views are not tracked (do not count as views)
   * Returns true if view was recorded, false if user already viewed or is the owner
   */
  async recordView(announcementId: string, userId: string): Promise<{ viewed: boolean; views_count: number }> {
    // Check if announcement exists
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
      select: ['id', 'status', 'owner_id'],
    });

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${announcementId} not found`);
    }

    // Only allow viewing published announcements
    if (announcement.status !== AnnouncementStatus.PUBLISHED) {
      throw new BadRequestException('Only published announcements can be viewed');
    }

    // Don't track views from the announcement owner
    if (announcement.owner_id === userId) {
      const updatedAnnouncement = await this.announcementRepository.findOne({
        where: { id: announcementId },
        select: ['views_count'],
      });
      return {
        viewed: false,
        views_count: updatedAnnouncement?.views_count || 0,
      };
    }

    // Check if user already viewed this announcement
    const existingView = await this.announcementViewRepository.findOne({
      where: {
        announcement_id: announcementId,
        user_id: userId,
      },
    });

    if (existingView) {
      // User already viewed, return current count
      const updatedAnnouncement = await this.announcementRepository.findOne({
        where: { id: announcementId },
        select: ['views_count'],
      });
      return {
        viewed: false,
        views_count: updatedAnnouncement?.views_count || 0,
      };
    }

    // Create new view record
    const view = this.announcementViewRepository.create({
      announcement_id: announcementId,
      user_id: userId,
    });

    await this.announcementViewRepository.save(view);

    // Get updated views count (trigger should update it, but fetch to be sure)
    const updatedAnnouncement = await this.announcementRepository.findOne({
      where: { id: announcementId },
      select: ['views_count'],
    });

    return {
      viewed: true,
      views_count: updatedAnnouncement?.views_count || 0,
    };
  }

  /**
   * Auto-close expired rent announcements (scheduled task).
   * Uses date_to as end date; when date_to has passed, status is set to CLOSED.
   */
  async closeExpiredRentAnnouncements(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredAnnouncements = await this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoin('announcement.owner', 'owner')
      .addSelect(['owner.id', 'owner.full_name'])
      .where('announcement.category = :category', { category: AnnouncementCategory.RENT })
      .andWhere('announcement.status = :status', { status: AnnouncementStatus.PUBLISHED })
      .getMany();

    for (const announcement of expiredAnnouncements) {
      if (announcement.date_to && new Date(announcement.date_to) < today) {
        announcement.status = AnnouncementStatus.CLOSED;
        announcement.closed_by = null; // System closed
        await this.announcementRepository.save(announcement);

        // Notify owner
        await this.sendNotificationToUser(
          announcement.owner_id,
          'Rental Period Ended',
          `Your rent announcement "${this.generateSummary(announcement)}" has been automatically closed as the rental period has ended.`,
          { announcementId: announcement.id }
        );

        this.logger.log(`Auto-closed expired rent announcement: ${announcement.id}`);
      }
    }
  }

  /**
   * Auto-close announcements where expiry_date has passed (scheduled task).
   * expiry_date is set from end date (e.g. date_to for rent) on create/update, so both end date and expiry date result in auto-close.
   */
  async closeExpiredAnnouncements(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredAnnouncements = await this.announcementRepository
      .createQueryBuilder('announcement')
      .leftJoin('announcement.owner', 'owner')
      .addSelect(['owner.id', 'owner.full_name'])
      .where('announcement.expiry_date IS NOT NULL')
      .andWhere('announcement.expiry_date < :today', { today })
      .andWhere('announcement.status = :status', { status: AnnouncementStatus.PUBLISHED })
      .getMany();

    for (const announcement of expiredAnnouncements) {
      announcement.status = AnnouncementStatus.CLOSED;
      announcement.closed_by = null; // System closed
      await this.announcementRepository.save(announcement);

      // Notify owner
      await this.sendNotificationToUser(
        announcement.owner_id,
        'Announcement Expired',
        `Your announcement "${this.generateSummary(announcement)}" has been automatically closed as it has reached its expiry date.`,
        { announcementId: announcement.id }
      );

      this.logger.log(`Auto-closed expired announcement: ${announcement.id} (expiry_date: ${announcement.expiry_date})`);
    }
  }
}
