import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Application, ApplicationStatus } from '../entities/application.entity';
import { Announcement, AnnouncementStatus, AnnouncementCategory } from '../entities/announcement.entity';
import { User } from '../entities/user.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { FcmService } from '../notifications/fcm.service';
import { DeviceTokenService } from '../notifications/device-token.service';
import { AnnouncementsService } from '../announcements/announcements.service';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    @InjectRepository(Application)
    private applicationRepository: Repository<Application>,
    @InjectRepository(Announcement)
    private announcementRepository: Repository<Announcement>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private fcmService: FcmService,
    private deviceTokenService: DeviceTokenService,
    private announcementsService: AnnouncementsService,
  ) {}

  /**
   * Validate user can apply
   */
  private validateUserCanApply(user: User): void {
    if (!user.verified) {
      throw new ForbiddenException('You must verify your account to apply to announcements');
    }

    if (user.is_locked || user.account_status === 'blocked') {
      throw new ForbiddenException('Your account is blocked or deactivated');
    }
  }

  /**
   * Validate that delivery dates are not in the past
   */
  private validateDeliveryDates(deliveryDates: string[]): void {
    if (!deliveryDates || deliveryDates.length === 0) {
      throw new BadRequestException('At least one delivery date is required');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for comparison

    const invalidDates: string[] = [];

    for (const dateStr of deliveryDates) {
      const delivery = new Date(dateStr);
      delivery.setHours(0, 0, 0, 0);

      if (delivery < today) {
        invalidDates.push(dateStr);
      }
    }

    if (invalidDates.length > 0) {
      throw new BadRequestException(
        `The following delivery dates cannot be in the past: ${invalidDates.join(', ')}`
      );
    }
  }

  /**
   * Validate status transition rules
   * Rules:
   * - pending → approved | rejected | closed
   * - approved → closed
   * - rejected → pending (optional, allowed)
   * - closed → no transitions allowed
   */
  private validateStatusTransition(
    currentStatus: ApplicationStatus,
    newStatus: ApplicationStatus,
  ): void {
    // No change needed
    if (currentStatus === newStatus) {
      return;
    }

    // Closed status cannot be changed
    if (currentStatus === ApplicationStatus.CLOSED) {
      throw new BadRequestException(
        'Cannot change status from closed. Application is already closed.',
      );
    }

    // Validate transitions from pending
    if (currentStatus === ApplicationStatus.PENDING) {
      const allowedTransitions = [
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.CLOSED,
      ];
      if (!allowedTransitions.includes(newStatus)) {
        throw new BadRequestException(
          `Cannot transition from ${currentStatus} to ${newStatus}. Allowed transitions: ${allowedTransitions.join(', ')}`,
        );
      }
      return;
    }

    // Validate transitions from approved
    if (currentStatus === ApplicationStatus.APPROVED) {
      if (newStatus !== ApplicationStatus.CLOSED) {
        throw new BadRequestException(
          `Cannot transition from ${currentStatus} to ${newStatus}. Only allowed transition: ${ApplicationStatus.CLOSED}`,
        );
      }
      return;
    }

    // Validate transitions from rejected
    if (currentStatus === ApplicationStatus.REJECTED) {
      if (newStatus !== ApplicationStatus.PENDING) {
        throw new BadRequestException(
          `Cannot transition from ${currentStatus} to ${newStatus}. Only allowed transition: ${ApplicationStatus.PENDING}`,
        );
      }
      return;
    }

    // Legacy CANCELED status - allow transition to CLOSED
    if (currentStatus === ApplicationStatus.CANCELED) {
      if (newStatus !== ApplicationStatus.CLOSED) {
        throw new BadRequestException(
          `Cannot transition from ${currentStatus} to ${newStatus}. Only allowed transition: ${ApplicationStatus.CLOSED}`,
        );
      }
      return;
    }
  }

  /**
   * Create application
   */
  async create(
    announcementId: string,
    createDto: CreateApplicationDto,
    applicantId: string
  ): Promise<Application> {
    // Validate user
    const applicant = await this.userRepository.findOne({ where: { id: applicantId } });
    if (!applicant) {
      throw new NotFoundException('User not found');
    }

    this.validateUserCanApply(applicant);

    // Get announcement with category
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // Check announcement status
    if (announcement.status !== AnnouncementStatus.PUBLISHED) {
      throw new BadRequestException('You can only apply to published announcements');
    }

    // Check if user is the announcer
    if (announcement.owner_id === applicantId) {
      throw new BadRequestException('You cannot apply to your own announcement');
    }

    // Check if already applied
    const existingApplication = await this.applicationRepository.findOne({
      where: {
        announcement_id: announcementId,
        applicant_id: applicantId,
        status: In([ApplicationStatus.PENDING, ApplicationStatus.APPROVED]),
      },
    });

    if (existingApplication) {
      throw new BadRequestException('You have already applied to this announcement');
    }

    // Validate count for goods category
    if (announcement.category === AnnouncementCategory.GOODS) {
      if (!createDto.count || createDto.count <= 0) {
        throw new BadRequestException('Count is required and must be greater than 0 for goods announcements');
      }
      
      // Check available quantity from database (for goods category)
      const availableQuantity = announcement.available_quantity || 0;
      
      if (createDto.count > availableQuantity) {
        throw new BadRequestException(
          `Count cannot exceed available amount (${availableQuantity})`
        );
      }
    } else {
      // For non-goods announcements, count should be null
      if (createDto.count !== undefined && createDto.count !== null) {
        throw new BadRequestException('Count is only applicable for goods announcements');
      }
    }

    // Validate delivery dates
    this.validateDeliveryDates(createDto.delivery_dates);

    // Convert date strings to Date objects
    const deliveryDates = createDto.delivery_dates.map(dateStr => new Date(dateStr));

    // Create application
    const application = this.applicationRepository.create({
      announcement_id: announcementId,
      applicant_id: applicantId,
      count: announcement.category === AnnouncementCategory.GOODS ? createDto.count : null,
      delivery_dates: deliveryDates,
      notes: createDto.notes || null,
      status: ApplicationStatus.PENDING,
    });

    const savedApplication = await this.applicationRepository.save(application);

    // Notify announcer
    try {
      const itemName = announcement.item?.name_en || announcement.item?.name_am || 'announcement';
      await this.sendNotificationToUser(announcement.owner_id, {
        title: 'New Application',
        body: `${applicant.full_name} applied to your announcement "${itemName}"`,
        data: {
          type: 'application_created',
          announcement_id: announcementId,
          application_id: savedApplication.id,
        },
      });
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
    }

    return savedApplication;
  }

  /**
   * Get one application by ID
   */
  async findOne(id: string): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: ['applicant', 'announcement'],
      withDeleted: false, // Exclude soft-deleted records
    });

    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    return application;
  }

  /**
   * Get applications for an announcement (announcer only)
   */
  async findByAnnouncement(
    announcementId: string,
    userId: string
  ): Promise<Application[]> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    if (announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only view applications for your own announcements');
    }

    return this.applicationRepository.find({
      where: { announcement_id: announcementId },
      relations: ['applicant'],
      order: { created_at: 'DESC' },
      withDeleted: false, // Exclude soft-deleted records
    });
  }

  /**
   * Send notification to a user by user ID (gets FCM tokens and sends to all active devices)
   */
  private async sendNotificationToUser(
    userId: string,
    payload: { title: string; body: string; data?: Record<string, string> }
  ): Promise<void> {
    try {
      const fcmTokens = await this.deviceTokenService.getActiveTokensForUser(userId);
      
      if (fcmTokens.length > 0) {
        const result = await this.fcmService.sendToDevices(fcmTokens, payload);
        this.logger.log(
          `Sent notifications to ${result.successCount} devices for user ${userId}`
        );
        
        if (result.failureCount > 0) {
          this.logger.warn(
            `Failed to send to ${result.failureCount} devices for user ${userId}`
          );
        }
      } else {
        this.logger.debug(`No active FCM tokens found for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to notify user ${userId}:`, error);
    }
  }

  /**
   * Get user's applications
   */
  async findMyApplications(userId: string): Promise<Application[]> {
    return this.applicationRepository.find({
      where: { applicant_id: userId },
      relations: ['announcement', 'announcement.owner'],
      order: { created_at: 'DESC' },
      withDeleted: false, // Exclude soft-deleted records
    });
  }

  /**
   * Approve application
   */
  async approve(
    announcementId: string,
    applicationId: string,
    userId: string
  ): Promise<void> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    if (announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only approve applications for your own announcements');
    }

    const application = await this.applicationRepository.findOne({
      where: { id: applicationId, announcement_id: announcementId },
      relations: ['applicant'],
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Validate status transition
    this.validateStatusTransition(application.status, ApplicationStatus.APPROVED);

    // Check available quantity from database (for goods category)
    if (announcement.category === AnnouncementCategory.GOODS) {
      const availableQuantity = announcement.available_quantity || 0;
      const requestedCount = application.count || 0;

      if (requestedCount > availableQuantity) {
        throw new BadRequestException(
          `Cannot approve: requested count (${requestedCount}) exceeds available (${availableQuantity})`
        );
      }
    }

    // Update application status
    application.status = ApplicationStatus.APPROVED;
    await this.applicationRepository.save(application);

    // Note: available_quantity is automatically recalculated by database trigger

    // Notify applicant
    try {
      const announcement = await this.announcementRepository.findOne({
        where: { id: announcementId },
        relations: ['item'],
      });
      const itemName = announcement?.item?.name_en || announcement?.item?.name_am || 'announcement';
      await this.sendNotificationToUser(application.applicant_id, {
        title: 'Application Approved',
        body: `Your application to "${itemName}" has been approved.`,
        data: {
          type: 'application_approved',
          announcement_id: announcementId,
          application_id: applicationId,
        },
      });
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
    }
  }

  /**
   * Reject application
   */
  async reject(
    announcementId: string,
    applicationId: string,
    userId: string
  ): Promise<void> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    if (announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only reject applications for your own announcements');
    }

    const application = await this.applicationRepository.findOne({
      where: { id: applicationId, announcement_id: announcementId },
      relations: ['applicant'],
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Validate status transition
    this.validateStatusTransition(application.status, ApplicationStatus.REJECTED);

    // Update application status
    application.status = ApplicationStatus.REJECTED;
    await this.applicationRepository.save(application);

    // Notify applicant
    try {
      const announcementWithItem = await this.announcementRepository.findOne({
        where: { id: announcementId },
        relations: ['item'],
      });
      const itemName = announcementWithItem?.item?.name_en || announcementWithItem?.item?.name_am || 'announcement';
      await this.sendNotificationToUser(application.applicant_id, {
        title: 'Application Rejected',
        body: `Your application to "${itemName}" has been rejected.`,
        data: {
          type: 'application_rejected',
          announcement_id: announcementId,
          application_id: applicationId,
        },
      });
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
    }
  }

  /**
   * Update application status (with transition validation)
   */
  async updateStatus(
    announcementId: string,
    applicationId: string,
    newStatus: ApplicationStatus,
    userId: string,
  ): Promise<Application> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    if (announcement.owner_id !== userId) {
      throw new ForbiddenException('You can only update applications for your own announcements');
    }

    const application = await this.applicationRepository.findOne({
      where: { id: applicationId, announcement_id: announcementId },
      relations: ['applicant'],
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Validate status transition
    this.validateStatusTransition(application.status, newStatus);

    // Update application status
    application.status = newStatus;
    const updated = await this.applicationRepository.save(application);

    this.logger.log(
      `Updated application ${applicationId} status from ${application.status} to ${newStatus}`,
    );

    return updated;
  }

  /**
   * Close application (convenience method)
   */
  async close(
    announcementId: string,
    applicationId: string,
    userId: string,
  ): Promise<Application> {
    return this.updateStatus(announcementId, applicationId, ApplicationStatus.CLOSED, userId);
  }
}

