import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementFavorite } from '../entities/announcement-favorite.entity';
import { AnnouncementsService } from '../announcements/announcements.service';
import { AnnouncementStatus } from '../entities/announcement.entity';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(AnnouncementFavorite)
    private favoriteRepository: Repository<AnnouncementFavorite>,
    private announcementsService: AnnouncementsService,
  ) {}

  /**
   * Add an announcement to user's favorites.
   * Only published announcements can be favorited.
   * Returns the full enriched announcement (same shape as GET /announcements/:id).
   */
  async create(userId: string, createDto: CreateFavoriteDto) {
    // Fetch full announcement first (validates existence)
    const announcement = await this.announcementsService.findOne(
      createDto.announcement_id,
      userId,
    );

    if (announcement.status !== AnnouncementStatus.PUBLISHED) {
      throw new BadRequestException(
        'Only published announcements can be added to favorites',
      );
    }

    const existing = await this.favoriteRepository.findOne({
      where: { announcement_id: createDto.announcement_id, user_id: userId },
    });

    if (existing) {
      throw new ConflictException('Announcement is already in your favorites');
    }

    const favorite = this.favoriteRepository.create({
      announcement_id: createDto.announcement_id,
      user_id: userId,
    });
    await this.favoriteRepository.save(favorite);

    // Return full enriched announcement so isFavorite = true is reflected
    return this.announcementsService.findOne(createDto.announcement_id, userId);
  }

  /**
   * Remove an announcement from user's favorites.
   * Returns the full enriched announcement (isFavorite will be false).
   */
  async remove(userId: string, announcementId: string) {
    const favorite = await this.favoriteRepository.findOne({
      where: { announcement_id: announcementId, user_id: userId },
    });

    if (!favorite) {
      throw new NotFoundException('Favorite not found');
    }

    await this.favoriteRepository.remove(favorite);

    // Return full enriched announcement (isFavorite = false now)
    return this.announcementsService.findOne(announcementId, userId);
  }

  /**
   * Get all favorites for a user.
   * Returns full enriched announcements — same shape as GET /announcements/:id.
   */
  async findAll(userId: string) {
    const favorites = await this.favoriteRepository.find({
      where: { user_id: userId },
      select: ['announcement_id'],
      order: { created_at: 'DESC' },
    });

    if (favorites.length === 0) return [];

    const announcements = await Promise.all(
      favorites.map((f) =>
        this.announcementsService.findOne(f.announcement_id, userId),
      ),
    );

    // Filter out any that may have been removed/unpublished
    return announcements.filter(Boolean);
  }

  /**
   * Get all favorites across all users (admin only).
   * Returns full enriched announcements without user-specific flags.
   */
  async findAllForAdmin() {
    const favorites = await this.favoriteRepository.find({
      select: ['announcement_id'],
      order: { created_at: 'DESC' },
    });

    if (favorites.length === 0) return [];

    // Deduplicate announcement IDs
    const uniqueIds = [...new Set(favorites.map((f) => f.announcement_id))];

    const announcements = await Promise.all(
      uniqueIds.map((id) => this.announcementsService.findOne(id)),
    );

    return announcements.filter(Boolean);
  }
}
