import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnnouncementsService } from '../announcements.service';

@Injectable()
export class AnnouncementExpiryTask {
  private readonly logger = new Logger(AnnouncementExpiryTask.name);

  constructor(
    private announcementsService: AnnouncementsService,
  ) {}

  /**
   * Auto-close expired rent announcements
   * Runs daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredRentAnnouncements() {
    this.logger.log('Checking for expired rent announcements...');

    try {
      await this.announcementsService.closeExpiredRentAnnouncements();
      this.logger.log('Expired rent announcements check completed');
    } catch (error) {
      this.logger.error('Error in expired rent announcements task:', error);
    }
  }

  /**
   * Auto-close announcements where expiry_date has passed
   * Runs daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredAnnouncements() {
    this.logger.log('Checking for expired announcements (expiry_date)...');

    try {
      await this.announcementsService.closeExpiredAnnouncements();
      this.logger.log('Expired announcements check completed');
    } catch (error) {
      this.logger.error('Error in expired announcements task:', error);
    }
  }
}
