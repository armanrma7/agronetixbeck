import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { 
  Announcement, 
  AnnouncementStatus, 
  AnnouncementCategory,
  AnnouncementType,
  Unit,
  RentUnit,
} from '../entities/announcement.entity';
import { User, UserType } from '../entities/user.entity';
import { GoodsCategory } from '../entities/goods-category.entity';
import { GoodsItem } from '../entities/goods-item.entity';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';
import { AnnouncementView } from '../entities/announcement-view.entity';
import { Application, ApplicationStatus } from '../entities/application.entity';
import { AnnouncementFavorite } from '../entities/announcement-favorite.entity';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { FcmService } from '../notifications/fcm.service';
import { DeviceTokenService } from '../notifications/device-token.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../entities/notification.entity';
import { StorageService } from '../storage/storage.service';
import { getMessage } from '../messages';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);
  private unitEnumValuesCache: Set<string> | null = null;
  private rentUnitEnumValuesCache: Set<string> | null = null;
  private enumLoading: Record<string, Promise<Set<string>> | undefined> = {};

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
    @InjectRepository(AnnouncementFavorite)
    private favoriteRepository: Repository<AnnouncementFavorite>,
    private dataSource: DataSource,
    private fcmService: FcmService,
    private deviceTokenService: DeviceTokenService,
    private notificationService: NotificationService,
    private storageService: StorageService,
    private configService: ConfigService,
  ) {}

  /**
   * Attach isFavorite and isApplied (has pending application) to a list of announcements for the given user.
   * If currentUserId is undefined, both flags are false.
   */
  private async attachUserFlags(
    announcements: Announcement[],
    currentUserId?: string,
  ): Promise<Announcement[]> {
    if (!currentUserId || announcements.length === 0) {
      for (const a of announcements) {
        (a as any).isFavorite = false;
        (a as any).isApplied = false;
      }
      return announcements;
    }

    const ids = announcements.map((a) => a.id);

    const [favorites, pendingApps] = await Promise.all([
      this.favoriteRepository.find({
        where: { user_id: currentUserId, announcement_id: In(ids) },
        select: ['announcement_id'],
      }),
      this.applicationRepository.find({
        where: {
          applicant_id: currentUserId,
          announcement_id: In(ids),
          status: ApplicationStatus.PENDING,
        },
        select: ['announcement_id'],
        withDeleted: false,
      }),
    ]);

    const favoriteIds = new Set(favorites.map((f) => f.announcement_id));
    const appliedIds = new Set(pendingApps.map((a) => a.announcement_id));

    for (const a of announcements) {
      (a as any).isFavorite = favoriteIds.has(a.id);
      (a as any).isApplied = appliedIds.has(a.id);
    }

    return announcements;
  }

  /**
   * For owner's "my announcements" list only: counts of applications by status (pending / approved).
   * Uses two separate aggregates so PG enum binding / raw aliases cannot drop rows.
   */
  private async attachOwnerPendingApprovedCounts(
    announcements: Announcement[],
  ): Promise<Announcement[]> {
    if (announcements.length === 0) {
      return announcements;
    }

    const ids = announcements.map((a) => a.id);

    const [pendingRows, approvedRows] = await Promise.all([
      this.applicationRepository
        .createQueryBuilder('app')
        .select('app.announcement_id', 'announcement_id')
        .addSelect('COUNT(*)', 'cnt')
        .where('app.announcement_id IN (:...ids)', { ids })
        .andWhere('app.status = :s', { s: ApplicationStatus.PENDING })
        .groupBy('app.announcement_id')
        .getRawMany(),
      this.applicationRepository
        .createQueryBuilder('app')
        .select('app.announcement_id', 'announcement_id')
        .addSelect('COUNT(*)', 'cnt')
        .where('app.announcement_id IN (:...ids)', { ids })
        .andWhere('app.status = :s', { s: ApplicationStatus.APPROVED })
        .groupBy('app.announcement_id')
        .getRawMany(),
    ]);

    const pendingMap = new Map<string, number>(
      pendingRows.map((r) => [String(r.announcement_id), Number(r.cnt)]),
    );
    const approvedMap = new Map<string, number>(
      approvedRows.map((r) => [String(r.announcement_id), Number(r.cnt)]),
    );

    for (const a of announcements) {
      const pending = pendingMap.get(a.id) ?? 0;
      const approved = approvedMap.get(a.id) ?? 0;
      (a as any).pending_application_count = pending;
      (a as any).approved_application_count = approved;
    }

    return announcements;
  }

  /**
   * Resolve applications count and data for an announcement
   */
  private async resolveApplications(announcement: Announcement, currentUserId?: string): Promise<Announcement> {
    if (!currentUserId) {
      (announcement as any).applications_count = 0;
      (announcement as any).applications = [];
      return announcement;
    }

    const applications = await this.applicationRepository.find({
      where: { announcement_id: announcement.id, applicant_id: currentUserId },
      relations: ['applicant', 'applicant.region', 'applicant.village'],
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
          region: { id: true, name_en: true, name_am: true, name_ru: true },
          village: { id: true, name_en: true, name_am: true, name_ru: true },
        },
      },
      order: { created_at: 'DESC' },
      withDeleted: false,
    });

    (announcement as any).applications_count = applications.length;
    (announcement as any).applications = applications;

    return announcement;
  }

  /**
   * Resolve applications count (only) for multiple announcements used in list responses.
   * Full applications array is intentionally excluded from list endpoints.
   */
  private async resolveApplicationsForAnnouncements(announcements: Announcement[]): Promise<Announcement[]> {
    if (announcements.length === 0) {
      return announcements;
    }

    const announcementIds = announcements.map(a => a.id);

    const counts: { announcement_id: string; count: string }[] = await this.applicationRepository
      .createQueryBuilder('application')
      .select('application.announcement_id', 'announcement_id')
      .addSelect('COUNT(*)', 'count')
      .where('application.announcement_id IN (:...ids)', { ids: announcementIds })
      .groupBy('application.announcement_id')
      .getRawMany();

    const countMap = new Map<string, number>(
      counts.map((r) => [r.announcement_id, Number(r.count)]),
    );

    for (const announcement of announcements) {
      (announcement as any).applications_count = countMap.get(announcement.id) ?? 0;
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
   * Batch-resolve regions_data / villages_data for many announcements (2 queries total).
   * Same shape as resolveRegionsAndVillages per item; order follows each announcement's UUID arrays.
   */
  private async resolveRegionsAndVillagesForMany(announcements: Announcement[]): Promise<void> {
    if (announcements.length === 0) {
      return;
    }

    const regionIdSet = new Set<string>();
    const villageIdSet = new Set<string>();
    for (const a of announcements) {
      a.regions?.forEach((id) => regionIdSet.add(id));
      a.villages?.forEach((id) => villageIdSet.add(id));
    }

    const [regionRows, villageRows] = await Promise.all([
      regionIdSet.size > 0
        ? this.regionRepository.find({
            where: { id: In([...regionIdSet]) },
            select: ['id', 'name_am', 'name_en', 'name_ru'],
          })
        : Promise.resolve([] as Region[]),
      villageIdSet.size > 0
        ? this.villageRepository.find({
            where: { id: In([...villageIdSet]) },
            select: ['id', 'name_am', 'name_en', 'name_ru'],
          })
        : Promise.resolve([] as Village[]),
    ]);

    const regionMap = new Map(regionRows.map((r) => [r.id, r]));
    const villageMap = new Map(villageRows.map((v) => [v.id, v]));

    for (const announcement of announcements) {
      if (announcement.regions && announcement.regions.length > 0) {
        (announcement as any).regions_data = announcement.regions
          .map((id) => regionMap.get(id))
          .filter((r): r is Region => r != null)
          .map((region) => ({
            id: region.id,
            name_am: region.name_am,
            name_en: region.name_en,
            name_ru: region.name_ru,
          }));
      } else {
        (announcement as any).regions_data = [];
      }

      if (announcement.villages && announcement.villages.length > 0) {
        (announcement as any).villages_data = announcement.villages
          .map((id) => villageMap.get(id))
          .filter((v): v is Village => v != null)
          .map((village) => ({
            id: village.id,
            name_am: village.name_am,
            name_en: village.name_en,
            name_ru: village.name_ru,
          }));
      } else {
        (announcement as any).villages_data = [];
      }
    }
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

      // Mutate in place so parallel enrichment steps on the same objects stay in sync
      announcement.images = signedUrls;
    }
    return announcement;
  }

  /**
   * Enrich multiple announcements with signed URLs and region/village names.
   * Uses batch region/village resolution (2 queries total) and fires all image
   * signing in parallel alongside the region lookup.
   */
  private async enrichAnnouncementsWithSignedUrls(announcements: Announcement[]): Promise<Announcement[]> {
    await Promise.all([
      Promise.all(announcements.map((a) => this.enrichWithSignedUrls(a))),
      this.resolveRegionsAndVillagesForMany(announcements),
    ]);
    return announcements;
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

  private async getDbEnumValues(enumTypeName: string): Promise<Set<string>> {
    const rows: Array<{ enumlabel: string }> = await this.dataSource.query(
      `
      SELECT e.enumlabel
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      WHERE t.typname = $1
      ORDER BY e.enumsortorder
      `,
      [enumTypeName],
    );
    return new Set((rows || []).map((r) => String(r.enumlabel)));
  }

  private async getEnumCached(enumTypeName: string): Promise<Set<string>> {
    if (enumTypeName === 'unit_enum' && this.unitEnumValuesCache) return this.unitEnumValuesCache;
    if (enumTypeName === 'rent_unit_enum' && this.rentUnitEnumValuesCache) return this.rentUnitEnumValuesCache;

    if (!this.enumLoading[enumTypeName]) {
      this.enumLoading[enumTypeName] = this.getDbEnumValues(enumTypeName).then((set) => {
        if (enumTypeName === 'unit_enum') this.unitEnumValuesCache = set;
        if (enumTypeName === 'rent_unit_enum') this.rentUnitEnumValuesCache = set;
        return set;
      });
    }
    return this.enumLoading[enumTypeName]!;
  }

  /** Unit is REQUIRED and must match DB enum `unit_enum` (never silently null). */
  private async normalizeUnitRequired(value: unknown): Promise<Unit> {
    if (value == null || String(value).trim() === '') {
      throw new BadRequestException('unit is required');
    }
    let s = String(value).toLowerCase().trim();
    // Handle Unicode superscript variants and their UTF-8-as-Latin-1 encoding artifacts
    if (s === 'm²' || s === 'mâ²') s = 'm2';
    if (s === 'm³' || s === 'mâ³') s = 'm3';

    const allowed = await this.getEnumCached('unit_enum');
    if (!allowed.has(s)) {
      throw new BadRequestException('Invalid unit');
    }
    return s as Unit;
  }

  /** Unit optional; if provided must be valid. */
  private async normalizeUnitOptional(value: unknown): Promise<Unit | null> {
    if (value == null || value === '') return null;
    return this.normalizeUnitRequired(value);
  }

  /** rent_unit optional; if provided must be valid (never silently null). */
  private async normalizeRentUnitOptional(value: unknown): Promise<RentUnit | null> {
    if (value == null || value === '') return null;
    const s = String(value).toLowerCase().trim();
    const allowed = await this.getEnumCached('rent_unit_enum');
    if (!allowed.has(s)) {
      throw new BadRequestException(
        'Invalid rent_unit',
      );
    }
    return s as RentUnit;
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
    if (dto.category === AnnouncementCategory.GOODS || dto.category === AnnouncementCategory.RENT) {
      if (!dto.count || dto.count <= 0) {
        throw new BadRequestException('count is required and must be > 0 for goods and rent categories');
      }
      // daily_limit is optional, but if provided, must be valid
      if (dto.daily_limit && dto.daily_limit > dto.count) {
        throw new BadRequestException('daily_limit cannot exceed count');
      }
    }

    // date_from / date_to are optional for all categories; when both provided, validate order
    if (dto.date_from?.trim() && dto.date_to?.trim()) {
      const dateFrom = this.parseDate(dto.date_from);
      const dateTo = this.parseDate(dto.date_to);
      if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new BadRequestException('date_from cannot be after date_to');
      }
    }
  }

  /**
   * All announcements are created with status PENDING.
   * Only admin can publish; owner or admin can close; owner can cancel.
   */
  private determineInitialStatus(): AnnouncementStatus {
    return AnnouncementStatus.PENDING;
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
    if ((announcement.category === AnnouncementCategory.GOODS || announcement.category === AnnouncementCategory.RENT) && announcement.count) {
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

    // All announcement types start as PENDING; only admin (or dedicated endpoints) can change status
    const status = this.determineInitialStatus();

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
      // Count: for GOODS it is required; for other categories it is optional but, if provided, should be stored.
      count: createDto.count ?? null,
      // For goods: daily_limit optional, others: NULL
      daily_limit: createDto.category === AnnouncementCategory.GOODS ? (createDto.daily_limit || null) : null,
      unit: await this.normalizeUnitRequired(createDto.unit),
      images: createDto.images || [],
      // date_from / date_to: optional for all announcement types
      date_from: createDto.date_from ? this.parseDate(createDto.date_from) : null,
      date_to: createDto.date_to ? this.parseDate(createDto.date_to) : null,
      min_area: createDto.min_area || null,
      rent_unit: await this.normalizeRentUnitOptional(createDto.rent_unit),
      regions: createDto.regions || [],
      villages: createDto.villages || [],
      expiry_date: expiryDate,
    });

    const savedAnnouncement = await this.announcementRepository.save(announcement);

    // Load relations for response
    const fullAnnouncement = await this.findOne(savedAnnouncement.id);

    const message =
      status === AnnouncementStatus.PENDING
        ? getMessage('announcements.createdVerificationNeeded', 'en')
        : getMessage('announcements.published', 'en');

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
    isAdmin?: boolean;
    ownerId?: string;
    currentUserId?: string;
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

    const isAdmin = params.isAdmin === true;

    // Status filter:
    // - If status is provided: always filter by that status (for all users).
    // - If no status and caller is admin: do NOT filter by status (see all).
    // - If no status and caller is not admin: default to PUBLISHED.
    if (params.status) {
      queryBuilder.andWhere('announcement.status = :status', {
        status: params.status,
      });
    } else if (!isAdmin) {
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

    // Filter by owner when requested (typically admin usage)
    if (params.ownerId) {
      queryBuilder.andWhere('announcement.owner_id = :ownerId', {
        ownerId: params.ownerId,
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

    // Exclude current user's announcements if excludeOwnerId is provided (non-admin only)
    if (params.excludeOwnerId && !isAdmin) {
      queryBuilder.andWhere('announcement.owner_id != :excludeOwnerId', {
        excludeOwnerId: params.excludeOwnerId,
      });
    }

    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    queryBuilder.skip(skip).take(limit).orderBy('announcement.created_at', 'DESC');

    const [announcements, total] = await queryBuilder.getManyAndCount();

    // List view: batch region/village lookups (2 queries) + applications count in parallel; no image signing
    if (announcements.length > 0) {
      await Promise.all([
        this.resolveRegionsAndVillagesForMany(announcements),
        this.resolveApplicationsForAnnouncements(announcements),
      ]);
    }

    const listWithoutImages = announcements.map((ann) => {
      const { images: _omit, ...rest } = ann as Announcement & { images?: string[] };
      return rest as Announcement;
    });

    const withFlags = await this.attachUserFlags(listWithoutImages, params.currentUserId);

    return {
      announcements: withFlags,
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
    currentUserId?: string;
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
    const withFlags = await this.attachUserFlags(enriched, params.currentUserId);
    return { announcements: withFlags, total, page, limit };
  }

  /**
   * Get announcement by ID
   */
  async findOne(id: string, currentUserId?: string): Promise<Announcement> {
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
    
    // Resolve applications count and data (only current user's applications)
    const withApplications = await this.resolveApplications(withRegions, currentUserId);

    // Attach isFavorite and isApplied
    const [enriched] = await this.attachUserFlags([withApplications], currentUserId);
    return enriched;
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

    // Run all enrichment steps in parallel — they are independent and all mutate in place
    await Promise.all([
      this.enrichAnnouncementsWithSignedUrls(announcements),       // signed URLs + batch regions/villages (2 DB queries)
      this.resolveApplicationsForAnnouncements(announcements),     // total application counts (1 DB query)
      this.attachUserFlags(announcements, userId),                  // isFavorite + isApplied flags (2 DB queries)
      this.attachOwnerPendingApprovedCounts(announcements),         // pending/approved counts (2 DB queries)
    ]);

    // Ensure counts are always enumerable on the JSON payload (spread + explicit keys)
    const announcementsPayload = announcements.map((ann) => {
      const { applications: _r1, images: _r2, ...rest } = ann as any;
      return {
        ...rest,
        pending_application_count: (ann as any).pending_application_count ?? 0,
        approved_application_count: (ann as any).approved_application_count ?? 0,
      };
    });

    return {
      announcements: announcementsPayload,
      total,
      page,
      limit,
    };
  }

  /**
   * Get announcements where the user has applied (created applications)
   * Returns only the user's own applications, not all applications
   */
  async findAnnouncementsWithMyApplications(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{ announcements: any[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    // Step 1: get distinct announcement IDs the user has applied to, paginated
    // GROUP BY deduplicates; MIN(created_at) must be in SELECT to be used in ORDER BY
    const distinctRows: { announcement_id: string }[] = await this.applicationRepository
      .createQueryBuilder('app')
      .select('app.announcement_id', 'announcement_id')
      .addSelect('MIN(app.created_at)', 'min_created_at')
      .where('app.applicant_id = :userId', { userId })
      .groupBy('app.announcement_id')
      .orderBy('min_created_at', 'DESC')
      .offset(skip)
      .limit(limit)
      .getRawMany();

    const total: number = await this.applicationRepository
      .createQueryBuilder('app')
      .select('COUNT(DISTINCT app.announcement_id)', 'cnt')
      .where('app.applicant_id = :userId', { userId })
      .getRawOne()
      .then((r) => Number(r?.cnt ?? 0));

    if (distinctRows.length === 0) {
      return { announcements: [], total, page, limit };
    }

    const announcementIds = distinctRows.map((r) => r.announcement_id);

    // Step 2: fetch all user applications for those announcements
    const userApplications = await this.applicationRepository.find({
      where: announcementIds.map((id) => ({ applicant_id: userId, announcement_id: id })),
      relations: ['announcement', 'announcement.owner', 'announcement.owner.region', 'announcement.owner.village', 'announcement.group', 'announcement.item'],
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
          owner: {
            id: true,
            full_name: true,
            region: { id: true, name_en: true, name_am: true, name_ru: true },
            village: { id: true, name_en: true, name_am: true, name_ru: true },
          },
        },
      },
      order: { created_at: 'DESC' },
    });

    // Step 3: group applications by announcement, preserving page order
    const announcementsMap = new Map<string, { announcement: Announcement; myApplications: Application[] }>();
    for (const id of announcementIds) {
      announcementsMap.set(id, { announcement: null as any, myApplications: [] });
    }
    for (const application of userApplications) {
      const entry = announcementsMap.get(application.announcement_id);
      if (entry) {
        entry.announcement = application.announcement;
        entry.myApplications.push(application);
      }
    }

    // Step 4: build announcement objects in page order, keeping user's applications per announcement
    const entries = announcementIds
      .map((id) => announcementsMap.get(id)!)
      .filter((entry) => entry.announcement !== null);

    const announcements = entries.map(({ announcement }) => announcement);

    // Step 5: run all enrichments in parallel
    await Promise.all([
      this.enrichAnnouncementsWithSignedUrls(announcements),      // signed URLs + batch regions/villages
      this.attachUserFlags(announcements, userId),                 // isFavorite + isApplied
      this.attachOwnerPendingApprovedCounts(announcements),        // pending/approved counts
    ]);

    const announcementsPayload = entries.map(({ announcement, myApplications }) => {
      const { applications: _r1, images: _r2, ...rest } = announcement as any;
      return {
        ...rest,
        my_applications_count: myApplications.length,
        pending_application_count: (announcement as any).pending_application_count ?? 0,
        approved_application_count: (announcement as any).approved_application_count ?? 0,
      };
    });

    return { announcements: announcementsPayload, total, page, limit };
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
      const updateFields = Object.keys(updateDto).filter(
        (key) => updateDto[key] !== undefined && key !== 'status',
      );
      const disallowedFields = updateFields.filter((field) => !allowedFields.includes(field));
      if (disallowedFields.length > 0) {
        throw new ForbiddenException(
          `Only expiry_date can be updated on a published announcement. Attempted: ${disallowedFields.join(', ')}`,
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
      
      if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new BadRequestException('date_from cannot be after date_to');
      }
    }

    // Validate daily_limit vs count if updating goods
    if (updateDto.daily_limit && (announcement.category === AnnouncementCategory.GOODS || announcement.category === AnnouncementCategory.RENT)) {
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

    // Validate group_id exists if being updated
    if (updateDto.group_id !== undefined) {
      const group = await this.categoryRepository.findOne({ where: { id: updateDto.group_id } });
      if (!group) {
        throw new BadRequestException(`Group with ID ${updateDto.group_id} not found`);
      }
    }

    // Validate item_id exists if being updated
    if (updateDto.item_id !== undefined) {
      const item = await this.itemRepository.findOne({ where: { id: updateDto.item_id } });
      if (!item) {
        throw new BadRequestException(`Item with ID ${updateDto.item_id} not found`);
      }
    }

    // Build a clean patch object with only the fields that were actually provided.
    // We use repository.update() (direct SQL UPDATE) to bypass TypeORM relation
    // tracking — otherwise loaded relation objects (group, item) override FK changes.
    const patch: Record<string, any> = {};

    if (updateDto.type      !== undefined) patch.type      = updateDto.type;
    if (updateDto.category  !== undefined) patch.category  = updateDto.category;
    if (updateDto.group_id  !== undefined) patch.group_id  = updateDto.group_id;
    if (updateDto.item_id   !== undefined) patch.item_id   = updateDto.item_id;
    if (updateDto.price     !== undefined) patch.price     = updateDto.price;
    if (updateDto.description !== undefined) patch.description = updateDto.description;
    if (updateDto.count     !== undefined) patch.count     = updateDto.count;
    if (updateDto.daily_limit !== undefined) patch.daily_limit = updateDto.daily_limit;
    if (updateDto.images    !== undefined) patch.images    = updateDto.images;
    if (updateDto.min_area  !== undefined) patch.min_area  = updateDto.min_area;
    if (updateDto.regions   !== undefined) patch.regions   = updateDto.regions;
    if (updateDto.villages  !== undefined) patch.villages  = updateDto.villages;

    // Validate enums against DB values
    if (updateDto.unit !== undefined) {
      patch.unit = await this.normalizeUnitOptional(updateDto.unit);
    }
    if (updateDto.rent_unit !== undefined) {
      patch.rent_unit = await this.normalizeRentUnitOptional(updateDto.rent_unit);
    }

    // Parse date fields
    if (updateDto.date_from !== undefined) {
      patch.date_from = this.parseDate(updateDto.date_from);
    }
    if (updateDto.date_to !== undefined) {
      const dateTo = this.parseDate(updateDto.date_to);
      patch.date_to = dateTo;
      const effectiveCategory = updateDto.category ?? announcement.category;
      if (effectiveCategory === AnnouncementCategory.RENT) {
        patch.expiry_date = dateTo;
      }
    }
    if (updateDto.expiry_date !== undefined) {
      patch.expiry_date = this.parseDate(updateDto.expiry_date);
    }

    try {
      await this.announcementRepository.update(id, patch);
    } catch (error) {
      if (error.message?.includes('invalid input value for enum')) {
        const enumMatch = error.message.match(/enum \w+_enum: "([^"]+)"/);
        const invalidValue = enumMatch?.[1] ?? '';
        throw new BadRequestException(`Invalid enum value: "${invalidValue}"`);
      }
      throw error;
    }

    return this.findOne(id, userId);
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
    await this.announcementRepository.update(id, { status: AnnouncementStatus.PUBLISHED });

    // Notify owner (creates DB record + push notification)
    try {
      await this.notificationService.create({
        user_id: announcement.owner_id,
        type: NotificationType.ANNOUNCEMENT_PUBLISHED,
        title: getMessage('announcements.publishedTitle', 'en'),
        body: getMessage('announcements.published', 'en'),
        data: {
          announcement_id: announcement.id,
          announcement_type: announcement.type,
          announcement_category: announcement.category,
          messageKey: 'announcements.published',
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
   * Notify users in matching regions and villages about a newly published announcement.
   * Uses Firebase push tokens from Supabase. Excludes the announcement owner.
   */
  private async notifyUsersInRegions(announcement: Announcement): Promise<void> {
    const hasRegions = announcement.regions && announcement.regions.length > 0;
    const hasVillages = announcement.villages && announcement.villages.length > 0;
    if (!hasRegions && !hasVillages) {
      this.logger.log(`Announcement ${announcement.id} has no regions or villages, skipping notifications`);
      return;
    }

    try {
      const userIds = new Set<string>();

      if (hasRegions) {
        const usersInRegions = await this.userRepository.find({
          where: {
            region_id: In(announcement.regions),
            verified: true,
            is_locked: false,
          },
          select: ['id'],
        });
        usersInRegions.forEach((u) => userIds.add(u.id));
      }

      if (hasVillages) {
        const usersInVillages = await this.userRepository.find({
          where: {
            village_id: In(announcement.villages),
            verified: true,
            is_locked: false,
          },
          select: ['id'],
        });
        usersInVillages.forEach((u) => userIds.add(u.id));
      }

      userIds.delete(announcement.owner_id);
      const usersToNotify = Array.from(userIds);

      if (usersToNotify.length === 0) {
        this.logger.log(`No users found in selected regions/villages to notify for announcement ${announcement.id}`);
        return;
      }

      this.logger.log(
        `Notifying ${usersToNotify.length} user(s) in regions/villages about announcement ${announcement.id}`,
      );

      const title = getMessage('announcements.newInRegion', 'en');
      const body = getMessage('announcements.newInRegionBody', 'en');
      const notificationPromises = usersToNotify.map((userId) =>
        this.notificationService
          .create({
            user_id: userId,
            type: NotificationType.ANNOUNCEMENT_PUBLISHED,
            title,
            body,
            data: {
              announcement_id: announcement.id,
              announcement_type: announcement.type,
              announcement_category: announcement.category,
              region_ids: announcement.regions,
              village_ids: announcement.villages,
              messageKey: 'announcements.newInRegion',
              messageBodyKey: 'announcements.newInRegionBody',
            },
            sendPush: true,
          })
          .catch((error) => {
            this.logger.warn(`Failed to notify user ${userId} about announcement ${announcement.id}: ${error.message}`);
            return null;
          }),
      );

      const results = await Promise.allSettled(notificationPromises);
      const successCount = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
      const failureCount = results.length - successCount;
      this.logger.log(
        `Region/village notifications sent: ${successCount} successful, ${failureCount} failed for announcement ${announcement.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send region/village notifications for announcement ${announcement.id}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Block announcement (admin action)
   */
  async block(id: string, adminId: string): Promise<Announcement> {
    const announcement = await this.findOne(id, adminId);

    announcement.status = AnnouncementStatus.BLOCKED;
    announcement.closed_by = adminId;
    await this.announcementRepository.update(id, { status: AnnouncementStatus.BLOCKED, closed_by: adminId });

    // Cancel all PENDING and APPROVED applications for the blocked announcement
    await this.applicationRepository
      .createQueryBuilder()
      .update()
      .set({ status: ApplicationStatus.CANCELED })
      .where('announcement_id = :id', { id })
      .andWhere('status IN (:...statuses)', {
        statuses: [ApplicationStatus.PENDING, ApplicationStatus.APPROVED],
      })
      .execute();

    this.logger.log(
      `Canceled pending/approved applications for blocked announcement ${id}`,
    );

    // Notify owner (centralized messages)
    await this.sendNotificationToUser(
      announcement.owner_id,
      getMessage('announcements.blockedTitle', 'en'),
      getMessage('announcements.blocked', 'en'),
      {
        announcement_id: announcement.id,
        messageKey: 'announcements.blocked',
      },
    );

    // Return enriched announcement
    return this.findOne(id, adminId);
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
    await this.announcementRepository.update(id, { status: AnnouncementStatus.CLOSED, closed_by: closedBy });

    // Return enriched announcement
    return this.findOne(id);
  }

  /**
   * Cancel announcement (owner or admin)
   */
  async cancel(id: string, userId: string, userType?: string): Promise<Announcement> {
    const announcement = await this.findOne(id);

    const isAdmin = userType === UserType.ADMIN;
    if (!isAdmin && announcement.owner_id !== userId) {
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
    await this.announcementRepository.update(id, { status: AnnouncementStatus.CANCELED });

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
   * Delete announcement (soft delete by marking as canceled). Owner or admin.
   */
  async remove(id: string, userId: string, userType?: string): Promise<void> {
    const announcement = await this.findOne(id);

    const isAdmin = userType === UserType.ADMIN;
    if (!isAdmin && announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only delete your own announcements');
    }

    // Only allow deleting non-published announcements
    if (announcement.status === AnnouncementStatus.PUBLISHED) {
      throw new ForbiddenException('Cannot delete published announcements. Please cancel it first.');
    }

    // Soft delete
    announcement.status = AnnouncementStatus.CANCELED;
    await this.announcementRepository.update(id, { status: AnnouncementStatus.CANCELED });

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
        await this.announcementRepository.update(announcement.id, { status: AnnouncementStatus.CLOSED, closed_by: null });

        // Notify owner (centralized messages)
        await this.sendNotificationToUser(
          announcement.owner_id,
          getMessage('announcements.expiredTitle', 'en'),
          getMessage('announcements.rentalPeriodEnded', 'en'),
          {
            announcement_id: announcement.id,
            messageKey: 'announcements.rentalPeriodEnded',
          },
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
      await this.announcementRepository.update(announcement.id, { status: AnnouncementStatus.CLOSED, closed_by: null });

      // Notify owner (centralized messages)
      await this.sendNotificationToUser(
        announcement.owner_id,
        getMessage('announcements.expiredTitle', 'en'),
        getMessage('announcements.announcementExpired', 'en'),
        {
          announcement_id: announcement.id,
          messageKey: 'announcements.announcementExpired',
        },
      );

      this.logger.log(`Auto-closed expired announcement: ${announcement.id} (expiry_date: ${announcement.expiry_date})`);
    }
  }
}
