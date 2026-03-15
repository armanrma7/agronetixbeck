import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { AnnouncementFavorite } from '../entities/announcement-favorite.entity';
import { Announcement, AnnouncementStatus } from '../entities/announcement.entity';
import { Application } from '../entities/application.entity';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';
import { StorageService } from '../storage/storage.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(AnnouncementFavorite)
    private favoriteRepository: Repository<AnnouncementFavorite>,
    @InjectRepository(Announcement)
    private announcementRepository: Repository<Announcement>,
    @InjectRepository(Application)
    private applicationRepository: Repository<Application>,
    @InjectRepository(Region)
    private regionRepository: Repository<Region>,
    @InjectRepository(Village)
    private villageRepository: Repository<Village>,
    private storageService: StorageService,
  ) {}

  /**
   * Add an announcement to user's favorites
   * Only published announcements can be favorited
   */
  async create(userId: string, createDto: CreateFavoriteDto): Promise<AnnouncementFavorite> {
    // Check if announcement exists
    const announcement = await this.announcementRepository.findOne({
      where: { id: createDto.announcement_id },
    });

    if (!announcement) {
      throw new NotFoundException(`Announcement with ID ${createDto.announcement_id} not found`);
    }

    // Only published announcements can be favorited
    if (announcement.status !== AnnouncementStatus.PUBLISHED) {
      throw new BadRequestException(
        'Only published announcements can be added to favorites'
      );
    }

    // Check if already favorited
    const existingFavorite = await this.favoriteRepository.findOne({
      where: {
        announcement_id: createDto.announcement_id,
        user_id: userId,
      },
    });

    if (existingFavorite) {
      throw new ConflictException('Announcement is already in your favorites');
    }

    // Create favorite
    const favorite = this.favoriteRepository.create({
      announcement_id: createDto.announcement_id,
      user_id: userId,
    });

    return this.favoriteRepository.save(favorite);
  }

  /**
   * Remove an announcement from user's favorites
   */
  async remove(userId: string, announcementId: string): Promise<void> {
    const favorite = await this.favoriteRepository.findOne({
      where: {
        announcement_id: announcementId,
        user_id: userId,
      },
    });

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    await this.favoriteRepository.remove(favorite);
  }

  /**
   * Enrich announcement with signed URLs for images
   */
  private async enrichWithSignedUrls(announcement: Announcement): Promise<Announcement> {
    if (announcement.images && announcement.images.length > 0) {
      const signedUrls = await this.storageService.getSignedUrls(announcement.images);
      return {
        ...announcement,
        images: signedUrls,
      };
    }
    return announcement;
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
   * Get all favorites (all users). Admin only.
   * Returns only published announcements, enriched with signed URLs and regions/villages.
   */
  async findAllForAdmin(): Promise<Announcement[]> {
    const favorites = await this.favoriteRepository.find({
      relations: [
        'announcement',
        'announcement.owner',
        'announcement.group',
        'announcement.item',
      ],
      order: { created_at: 'DESC' },
    });

    const publishedAnnouncements = favorites
      .map((f) => f.announcement)
      .filter((a) => a && a.status === AnnouncementStatus.PUBLISHED);

    if (publishedAnnouncements.length === 0) {
      return [];
    }

    const enrichedPromises = publishedAnnouncements.map(async (announcement) => {
      const withUrls = await this.enrichWithSignedUrls(announcement);
      const withRegions = await this.resolveRegionsAndVillages(withUrls);
      return { ...(withRegions as any), applications: [] } as Announcement & { applications: Application[] };
    });

    return Promise.all(enrichedPromises);
  }

  /**
   * Get all favorites for a user
   * Returns only published announcements, enriched with:
   * - signed URLs
   * - regions/villages data
   * - applications of the current user for each announcement
   */
  async findAll(userId: string): Promise<Announcement[]> {
    const favorites = await this.favoriteRepository.find({
      where: { user_id: userId },
      relations: [
        'announcement',
        'announcement.owner',
        'announcement.group',
        'announcement.item',
      ],
      order: { created_at: 'DESC' },
    });

    // Filter to only include published announcements
    const publishedAnnouncements = favorites
      .map((favorite) => favorite.announcement)
      .filter(
        (announcement) => announcement && announcement.status === AnnouncementStatus.PUBLISHED,
      );

    if (publishedAnnouncements.length === 0) {
      return [];
    }

    const announcementIds = publishedAnnouncements.map((a) => a.id);

    // Load applications for these announcements belonging to the current user
    const applications = await this.applicationRepository.find({
      where: {
        announcement_id: In(announcementIds),
        applicant_id: userId,
      },
      select: [
        'id',
        'announcement_id',
        'applicant_id',
        'count',
        'delivery_dates',
        'notes',
        'status',
        'created_at',
        'updated_at',
      ],
      order: { created_at: 'DESC' },
    });

    const appsByAnnouncement = new Map<string, Application[]>();
    for (const app of applications) {
      const list = appsByAnnouncement.get(app.announcement_id) || [];
      list.push(app);
      appsByAnnouncement.set(app.announcement_id, list);
    }

    // Enrich announcements with signed URLs, regions/villages, and applications
    const enrichedPromises = publishedAnnouncements.map(async (announcement) => {
      const withUrls = await this.enrichWithSignedUrls(announcement);
      const withRegions = await this.resolveRegionsAndVillages(withUrls);
      const userApplications = appsByAnnouncement.get(announcement.id) || [];

      return {
        ...(withRegions as any),
        applications: userApplications,
      } as Announcement & { applications: Application[] };
    });

    return Promise.all(enrichedPromises);
  }

  /**
   * Check if an announcement is favorited by a user
   */
  async isFavorited(userId: string, announcementId: string): Promise<boolean> {
    const favorite = await this.favoriteRepository.findOne({
      where: {
        announcement_id: announcementId,
        user_id: userId,
      },
    });

    return !!favorite;
  }

  /**
   * Get favorite count for an announcement
   */
  async getFavoriteCount(announcementId: string): Promise<number> {
    return this.favoriteRepository.count({
      where: { announcement_id: announcementId },
    });
  }
}
