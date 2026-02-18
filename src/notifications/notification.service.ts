import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Notification, NotificationType } from '../entities/notification.entity';
import { FcmService, NotificationPayload } from './fcm.service';
import { DeviceTokenService } from './device-token.service';

export interface CreateNotificationDto {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  sendPush?: boolean; // Whether to send Firebase push notification (default: true)
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    private fcmService: FcmService,
    private deviceTokenService: DeviceTokenService,
  ) {}

  /**
   * Create a notification and optionally send it via Firebase
   */
  async create(dto: CreateNotificationDto): Promise<Notification> {
    // Create notification in database
    const notification = this.notificationRepository.create({
      user_id: dto.user_id,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      data: dto.data || {},
    });

    const savedNotification = await this.notificationRepository.save(notification);

    // Send push notification if requested (default: true)
    const shouldSendPush = dto.sendPush !== false;
    if (shouldSendPush) {
      try {
        await this.sendPushNotification(dto.user_id, {
          title: dto.title,
          body: dto.body,
          data: {
            ...dto.data,
            notification_id: savedNotification.id,
            type: dto.type,
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to send push notification for notification ${savedNotification.id}:`,
          error,
        );
        // Don't throw - notification is saved even if push fails
      }
    }

    return savedNotification;
  }

  /**
   * Send push notification to user's devices via Firebase
   */
  private async sendPushNotification(
    userId: string,
    payload: NotificationPayload & { data?: Record<string, any> },
  ): Promise<void> {
    const fcmTokens = await this.deviceTokenService.getActiveTokensForUser(userId);

    if (fcmTokens.length > 0) {
      this.logger.log(`Sending push to ${fcmTokens.length} device(s) for user ${userId}`);
      const result = await this.fcmService.sendToDevices(fcmTokens, {
        title: payload.title,
        body: payload.body,
        data: Object.entries(payload.data || {}).reduce(
          (acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
          },
          {} as Record<string, string>,
        ),
      });

      this.logger.log(
        `Sent push notifications to ${result.successCount} devices for user ${userId}`,
      );

      if (result.failureCount > 0) {
        const isAuthError = result.failureReason === 'messaging/third-party-auth-error';
        if (isAuthError) {
          this.logger.warn(
            `FCM send failed (server auth): ${result.failureReason}. ` +
              `Fix: 1) In Google Cloud Console (project from service account), enable "Firebase Cloud Messaging API". ` +
              `2) Use the service account JSON from Firebase Console → Project settings → Service accounts → Generate new private key.`,
          );
        } else {
          this.logger.warn(
            `Failed to send to ${result.failureCount} device(s) for user ${userId}. ` +
              `Usually this means the FCM token is invalid or expired. User should re-register device via POST /device-tokens.`,
          );
        }
      }

      // Deactivate invalid/expired tokens so we don't keep trying
      if (result.invalidTokens?.length > 0) {
        for (const token of result.invalidTokens) {
          try {
            await this.deviceTokenService.deactivateToken(token);
            this.logger.log(`Deactivated invalid FCM token for user ${userId}`);
          } catch (err) {
            this.logger.error(`Failed to deactivate invalid token:`, err);
          }
        }
      }
    } else {
      this.logger.debug(`No active FCM tokens found for user ${userId}`);
    }
  }

  /**
   * Get all notifications for a user with filters and pagination
   */
  async findAll(
    userId: string,
    filters?: {
      is_seen?: boolean;
      type?: NotificationType;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    notifications: Notification[];
    total: number;
    page: number;
    limit: number;
    unread_count: number;
  }> {
    const where: FindOptionsWhere<Notification> = {
      user_id: userId,
    };

    if (filters?.is_seen !== undefined) {
      where.is_seen = filters.is_seen;
    }

    if (filters?.type) {
      where.type = filters.type;
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    // Get paginated notifications and total count
    const [notifications, total] = await this.notificationRepository.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip,
      take: limit,
    });

    // Get unread count
    const unreadCount = await this.notificationRepository.count({
      where: {
        user_id: userId,
        is_seen: false,
      },
    });

    return {
      notifications,
      total,
      page,
      limit,
      unread_count: unreadCount,
    };
  }

  /**
   * Get a single notification by ID
   */
  async findOne(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification with ID ${id} not found`);
    }

    return notification;
  }

  /**
   * Mark a notification as seen
   */
  async markAsSeen(id: string, userId: string): Promise<Notification> {
    const notification = await this.findOne(id, userId);

    if (!notification.is_seen) {
      notification.is_seen = true;
      notification.seen_at = new Date();
      await this.notificationRepository.save(notification);
    }

    return notification;
  }

  /**
   * Mark all notifications as seen for a user
   */
  async markAllAsSeen(userId: string): Promise<{ count: number }> {
    const result = await this.notificationRepository.update(
      {
        user_id: userId,
        is_seen: false,
      },
      {
        is_seen: true,
        seen_at: new Date(),
      },
    );

    return { count: result.affected || 0 };
  }

  /**
   * Get unread notification count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: {
        user_id: userId,
        is_seen: false,
      },
    });
  }
}
