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
import { User, UserType } from '../entities/user.entity';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../entities/notification.entity';
import { AnnouncementsService } from '../announcements/announcements.service';

/**
 * Notification rules:
 * - Someone applied → notify only the ANNOUNCEMENT OWNER (announcement.owner_id).
 * - Approved / Rejected / Closed → notify only the APPLICANT (application.applicant_id).
 */
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
    private notificationService: NotificationService,
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

    // Get announcement with category and item (for notification message)
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
      relations: ['item'],
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

    // Allow only one pending application per user per announcement; if previous was rejected/closed, user can apply again
    const existingPending = await this.applicationRepository.findOne({
      where: {
        announcement_id: announcementId,
        applicant_id: applicantId,
        status: ApplicationStatus.PENDING,
      },
    });
    if (existingPending) {
      throw new BadRequestException('You already have a pending application for this announcement');
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

    // Notify only the announcement owner (no one else)
    try {
      const itemName = announcement.item?.name_en || announcement.item?.name_am || 'announcement';
      await this.notificationService.create({
        user_id: announcement.owner_id, // only announcement owner
        type: NotificationType.APPLICATION_CREATED,
        title: 'New Application',
        body: `${applicant.full_name} applied to your announcement "${itemName}"`,
        data: {
          announcement_id: announcementId,
          application_id: savedApplication.id,
          applicant_name: applicant.full_name,
        },
        sendPush: true,
      });
    } catch (error) {
      this.logger.error('Failed to send application notification:', error);
    }

    return savedApplication;
  }

  /**
   * Get one application by ID (includes applicant_id and applicant with id for the user who created the application)
   */
  async findOne(id: string): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: ['applicant', 'announcement'],
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
        applicant: { id: true, full_name: true },
        announcement: { id: true },
      },
      withDeleted: false,
    });

    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    return application;
  }

  /**
   * Update application: announcement owner or application owner (applicant) can edit, only when status is PENDING.
   */
  async update(
    applicationId: string,
    updateDto: UpdateApplicationDto,
    userId: string,
  ): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['announcement'],
      withDeleted: false,
    });

    if (!application) {
      throw new NotFoundException(`Application with ID ${applicationId} not found`);
    }

    const announcement = await this.announcementRepository.findOne({
      where: { id: application.announcement_id },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    if (announcement.owner_id !== userId && application.applicant_id !== userId) {
      throw new ForbiddenException('Only the announcement owner or the application owner (applicant) can edit this application');
    }

    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException(
        'Only pending applications can be edited. Current status: ' + application.status,
      );
    }

    if (updateDto.delivery_dates !== undefined) {
      this.validateDeliveryDates(updateDto.delivery_dates);
      application.delivery_dates = updateDto.delivery_dates.map((d) => new Date(d));
    }

    if (updateDto.count !== undefined) {
      if (announcement.category === AnnouncementCategory.GOODS) {
        const availableQuantity = Number(announcement.available_quantity ?? 0);
        if (updateDto.count > availableQuantity) {
          throw new BadRequestException(
            `Count cannot exceed available quantity (${availableQuantity})`,
          );
        }
        application.count = updateDto.count;
      } else {
        application.count = null;
      }
    }

    if (updateDto.notes !== undefined) {
      application.notes = updateDto.notes;
    }

    return this.applicationRepository.save(application);
  }

  /**
   * Get applications for an announcement.
   * - Owner or admin: all applications (any status).
   * - Applicant: only their own applications for this announcement (any status).
   */
  async findByAnnouncement(
    announcementId: string,
    userId: string,
    userType?: string,
    page?: number,
    limit?: number
  ): Promise<{ applications: Application[]; total: number; page: number; limit: number }> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const isOwner = announcement.owner_id === userId;
    const isAdmin = userType === UserType.ADMIN;

    const pageNum = page || 1;
    const limitNum = limit || 20;
    const skip = (pageNum - 1) * limitNum;

    const applicantSelect = {
      id: true, full_name: true, phone: true,
      profile_picture: true, user_type: true,
    };

    if (isOwner || isAdmin) {
      // Owner or admin: see all applications (any status)
      const [applications, total] = await this.applicationRepository.findAndCount({
        where: { announcement_id: announcementId },
        relations: ['applicant'],
        select: {
          id: true, announcement_id: true, applicant_id: true,
          count: true, delivery_dates: true, notes: true,
          status: true, created_at: true, updated_at: true,
          applicant: applicantSelect,
        },
        order: { created_at: 'DESC' },
        withDeleted: false,
        skip,
        take: limitNum,
      });
      return { applications, total, page: pageNum, limit: limitNum };
    }

    // Applicant: see only their own applications for this announcement (any status)
    const [applications, total] = await this.applicationRepository.findAndCount({
      where: {
        announcement_id: announcementId,
        applicant_id: userId,
      },
      relations: ['applicant'],
      select: {
        id: true, announcement_id: true, applicant_id: true,
        count: true, delivery_dates: true, notes: true,
        status: true, created_at: true, updated_at: true,
        applicant: applicantSelect,
      },
      order: { created_at: 'DESC' },
      withDeleted: false,
      skip,
      take: limitNum,
    });

    return {
      applications,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }

  /**
   * Get user's applications with pagination
   */
  async findMyApplications(
    userId: string,
    page?: number,
    limit?: number
  ): Promise<{ applications: Application[]; total: number; page: number; limit: number }> {
    const pageNum = page || 1;
    const limitNum = limit || 20;
    const skip = (pageNum - 1) * limitNum;

    const safeUserSelect = {
      id: true, full_name: true, phone: true,
      profile_picture: true, user_type: true,
    };

    const [applications, total] = await this.applicationRepository.findAndCount({
      where: { applicant_id: userId },
      relations: ['applicant', 'announcement', 'announcement.owner'],
      select: {
        id: true, announcement_id: true, applicant_id: true,
        count: true, delivery_dates: true, notes: true,
        status: true, created_at: true, updated_at: true,
        applicant: safeUserSelect,
        announcement: {
          id: true, type: true, category: true, price: true,
          description: true, status: true, images: true,
          count: true, unit: true, date_from: true, date_to: true,
          expiry_date: true, created_at: true,
          owner: safeUserSelect,
        },
      },
      order: { created_at: 'DESC' },
      withDeleted: false,
      skip,
      take: limitNum,
    });

    return {
      applications,
      total,
      page: pageNum,
      limit: limitNum,
    };
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

    // Notify only the applicant (owner of the application; no one else)
    try {
      const announcementWithItem = await this.announcementRepository.findOne({
        where: { id: announcementId },
        relations: ['item'],
      });
      const itemName = announcementWithItem?.item?.name_en || announcementWithItem?.item?.name_am || 'announcement';
      await this.notificationService.create({
        user_id: application.applicant_id, // only the user who applied
        type: NotificationType.APPLICATION_APPROVED,
        title: 'Application Approved',
        body: `Your application to "${itemName}" has been approved.`,
        data: {
          announcement_id: announcementId,
          application_id: applicationId,
        },
        sendPush: true,
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

    // Notify only the applicant (owner of the application; no one else)
    try {
      const announcementWithItem = await this.announcementRepository.findOne({
        where: { id: announcementId },
        relations: ['item'],
      });
      const itemName = announcementWithItem?.item?.name_en || announcementWithItem?.item?.name_am || 'announcement';
      await this.notificationService.create({
        user_id: application.applicant_id, // only the user who applied
        type: NotificationType.APPLICATION_REJECTED,
        title: 'Application Rejected',
        body: `Your application to "${itemName}" has been rejected.`,
        data: {
          announcement_id: announcementId,
          application_id: applicationId,
        },
        sendPush: true,
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

    // When closed via updateStatus, notify only the applicant (application owner)
    if (newStatus === ApplicationStatus.CLOSED) {
      try {
        const announcementWithItem = await this.announcementRepository.findOne({
          where: { id: announcementId },
          relations: ['item'],
        });
        const itemName = announcementWithItem?.item?.name_en || announcementWithItem?.item?.name_am || 'announcement';
        await this.notificationService.create({
          user_id: application.applicant_id, // only the user who applied
          type: NotificationType.APPLICATION_CLOSED,
          title: 'Application Closed',
          body: `Your application to "${itemName}" has been closed.`,
          data: {
            announcement_id: announcementId,
            application_id: applicationId,
          },
          sendPush: true,
        });
      } catch (error) {
        this.logger.error('Failed to send application closed notification:', error);
      }
    }

    this.logger.log(
      `Updated application ${applicationId} status from ${application.status} to ${newStatus}`,
    );

    return updated;
  }

  /**
   * Close application. Allowed for:
   * - Announcement owner (announcer): closes the application.
   * - Application owner (applicant): closes/cancels their own application (only when PENDING).
   */
  async close(
    announcementId: string,
    applicationId: string,
    userId: string,
  ): Promise<Application> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const application = await this.applicationRepository.findOne({
      where: { id: applicationId, announcement_id: announcementId },
      relations: ['applicant'],
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }

    const isAnnouncementOwner = announcement.owner_id === userId;
    const isApplicationOwner = application.applicant_id === userId;

    if (isAnnouncementOwner) {
      return this.updateStatus(announcementId, applicationId, ApplicationStatus.CLOSED, userId);
    }

    if (isApplicationOwner) {
      if (application.status !== ApplicationStatus.PENDING) {
        throw new BadRequestException(
          'Only pending applications can be closed by the applicant. Current status: ' + application.status,
        );
      }
      application.status = ApplicationStatus.CLOSED;
      const updated = await this.applicationRepository.save(application);
      this.logger.log(`Application ${applicationId} closed by applicant`);
      return updated;
    }

    throw new ForbiddenException('Only the announcement owner or the application owner can close this application');
  }
}

