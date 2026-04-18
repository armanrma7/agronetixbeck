import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import { getMessage } from '../messages';

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
   * Parse YYYY-MM-DD as a calendar date in local time (avoids UTC vs local bugs from `new Date(isoDate)`).
   */
  private parseDeliveryDateOnly(dateStr: string): Date {
    const m = String(dateStr).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      throw new BadRequestException(
        `Invalid delivery date "${dateStr}". Use YYYY-MM-DD (e.g. 2026-03-01).`,
      );
    }
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10) - 1;
    const d = parseInt(m[3], 10);
    const dt = new Date(y, mo, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) {
      throw new BadRequestException(`Invalid calendar date: "${dateStr}"`);
    }
    return dt;
  }

  /** True when announcement defines a period — then delivery_dates are required on apply/update. */
  private announcementRequiresDeliveryDates(announcement: Announcement): boolean {
    return announcement.date_from != null || announcement.date_to != null;
  }

  /**
   * Validate delivery dates: if required, at least one date; each date must be today or later (local).
   */
  private validateDeliveryDates(
    deliveryDates: string[] | undefined | null,
    required: boolean,
  ): void {
    const arr = deliveryDates ?? [];
    if (arr.length === 0) {
      if (required) {
        throw new BadRequestException(
          'At least one delivery date is required for announcements with a start or end date',
        );
      }
      return;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const invalidDates: string[] = [];

    for (const dateStr of arr) {
      const delivery = this.parseDeliveryDateOnly(dateStr);
      if (delivery < todayStart) {
        invalidDates.push(dateStr);
      }
    }

    if (invalidDates.length > 0) {
      const iso = todayStart.toISOString().slice(0, 10);
      throw new BadRequestException(
        `Each delivery date must be today or later (server date: ${iso}). ` +
          `These are before today: ${invalidDates.join(', ')}`,
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
        ApplicationStatus.CANCELED,
      ];
      if (!allowedTransitions.includes(newStatus)) {
        throw new BadRequestException(
          `Cannot transition from ${currentStatus} to ${newStatus}. Allowed transitions: ${allowedTransitions.join(', ')}`,
        );
      }
      return;
    }

    // Validate transitions from approved (announcement owner can reject or close/cancel)
    if (currentStatus === ApplicationStatus.APPROVED) {
      const allowed = [
        ApplicationStatus.CLOSED,
        ApplicationStatus.CANCELED,
        ApplicationStatus.REJECTED,
      ];
      if (!allowed.includes(newStatus)) {
        throw new BadRequestException(
          `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowed.join(', ')}`,
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
    } else {
      // For non-goods announcements, count should be null
      if (createDto.count !== undefined && createDto.count !== null) {
        throw new BadRequestException('Count is only applicable for goods announcements');
      }
    }

    const datesRequired = this.announcementRequiresDeliveryDates(announcement);
    this.validateDeliveryDates(createDto.delivery_dates, datesRequired);

    const rawDates = createDto.delivery_dates ?? [];
    const deliveryDates =
      rawDates.length === 0 ? [] : rawDates.map((dateStr) => this.parseDeliveryDateOnly(dateStr));

    // Create application
    const application = this.applicationRepository.create({
      announcement,
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
        user_id: announcement.owner_id,
        type: NotificationType.APPLICATION_CREATED,
        title: getMessage('applications.newApplication', 'en'),
        body: `${applicant.full_name} applied to your announcement "${itemName}"`,
        data: {
          announcement_id: announcementId,
          application_id: savedApplication.id,
          applicant_name: applicant.full_name,
          messageKey: 'applications.newApplication',
        },
        sendPush: true,
      });
    } catch (error) {
      this.logger.error('Failed to send application notification:', error);
    }

    return savedApplication;
  }

  /**
   * Get one application by ID. Allowed for applicant, announcement owner, or admin.
   * If userId/userType are provided, enforces access; otherwise returns without check (for internal use).
   */
  async findOne(id: string, userId?: string, userType?: string): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id },
      relations: ['applicant', 'applicant.region', 'applicant.village', 'announcement', 'announcement.owner'],
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
          region: { id: true, name_en: true, name_am: true, name_ru: true },
          village: { id: true, name_en: true, name_am: true, name_ru: true },
        },
        announcement: { id: true, owner_id: true, owner: { id: true } },
      },
      withDeleted: false,
    });

    if (!application) {
      throw new NotFoundException(`Application with ID ${id} not found`);
    }

    if (userId !== undefined && userType !== undefined) {
      const isAdmin = userType === UserType.ADMIN;
      const isApplicant = application.applicant_id === userId;
      const isAnnouncementOwner = (application.announcement as { owner_id?: string })?.owner_id === userId;
      if (!isAdmin && !isApplicant && !isAnnouncementOwner) {
        throw new ForbiddenException(
          'You can only view your own applications or those for your announcements',
        );
      }
    }

    return application;
  }

  /**
   * Update application: announcement owner or application owner (applicant) or admin can edit, only when status is PENDING.
   */
  async update(
    applicationId: string,
    updateDto: UpdateApplicationDto,
    userId: string,
    userType?: string,
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

    const isAdmin = userType === UserType.ADMIN;
    if (!isAdmin && announcement.owner_id !== userId && application.applicant_id !== userId) {
      throw new ForbiddenException('Only the announcement owner or the application owner (applicant) can edit this application');
    }

    if (application.status !== ApplicationStatus.PENDING) {
      throw new BadRequestException(
        'Only pending applications can be edited. Current status: ' + application.status,
      );
    }

    if (updateDto.delivery_dates !== undefined) {
      const datesRequired = this.announcementRequiresDeliveryDates(announcement);
      this.validateDeliveryDates(updateDto.delivery_dates, datesRequired);
      application.delivery_dates =
        updateDto.delivery_dates.length === 0
          ? []
          : updateDto.delivery_dates.map((d) => this.parseDeliveryDateOnly(d));
    }

    if (updateDto.count !== undefined) {
      if (announcement.category === AnnouncementCategory.GOODS) {
        application.count = Number(updateDto.count);
      } else {
        application.count = null;
      }
    }

    if (updateDto.notes !== undefined) {
      application.notes = updateDto.notes;
    }

    await this.applicationRepository.save(application);
    return this.findOne(applicationId);
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
      region: { id: true, name_en: true, name_am: true, name_ru: true },
      village: { id: true, name_en: true, name_am: true, name_ru: true },
    };

    if (isOwner || isAdmin) {
      // Owner or admin: see all applications (any status)
      const [applications, total] = await this.applicationRepository.findAndCount({
        where: { announcement_id: announcementId },
        relations: ['applicant', 'applicant.region', 'applicant.village'],
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
      relations: ['applicant', 'applicant.region', 'applicant.village'],
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
   * Admin: get all applications with pagination (no filter by applicant).
   */
  async findAllForAdmin(
    page?: number,
    limit?: number,
  ): Promise<{ applications: Application[]; total: number; page: number; limit: number }> {
    const pageNum = page || 1;
    const limitNum = limit || 20;
    const skip = (pageNum - 1) * limitNum;

    const safeUserSelect = {
      id: true,
      full_name: true,
      phone: true,
      profile_picture: true,
      user_type: true,
      region: { id: true, name_en: true, name_am: true, name_ru: true },
      village: { id: true, name_en: true, name_am: true, name_ru: true },
    };

    const [applications, total] = await this.applicationRepository.findAndCount({
      relations: ['applicant', 'applicant.region', 'applicant.village', 'announcement', 'announcement.owner'],
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
        applicant: safeUserSelect,
        announcement: {
          id: true,
          type: true,
          category: true,
          price: true,
          description: true,
          status: true,
          images: true,
          count: true,
          unit: true,
          date_from: true,
          date_to: true,
          expiry_date: true,
          created_at: true,
          owner: safeUserSelect,
        },
      },
      order: { created_at: 'DESC' },
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
      region: { id: true, name_en: true, name_am: true, name_ru: true },
      village: { id: true, name_en: true, name_am: true, name_ru: true },
    };

    const [applications, total] = await this.applicationRepository.findAndCount({
      where: { applicant_id: userId },
      relations: ['applicant', 'applicant.region', 'applicant.village', 'announcement', 'announcement.owner'],
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
   * Approve application (announcement owner or admin). Returns the updated application.
   */
  async approve(
    announcementId: string,
    applicationId: string,
    userId: string,
    userType?: string,
  ): Promise<Application> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const isAdmin = userType === UserType.ADMIN;
    if (!isAdmin && announcement.owner_id !== userId) {
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

    // Update application status
    await this.applicationRepository.update(applicationId, { status: ApplicationStatus.APPROVED });
    application.status = ApplicationStatus.APPROVED;

    // Notify only the applicant (owner of the application; no one else)
    try {
      const announcementWithItem = await this.announcementRepository.findOne({
        where: { id: announcementId },
        relations: ['item'],
      });
      const itemName = announcementWithItem?.item?.name_en || announcementWithItem?.item?.name_am || 'announcement';
      await this.notificationService.create({
        user_id: application.applicant_id,
        type: NotificationType.APPLICATION_APPROVED,
        title: getMessage('applications.applicationApproved', 'en'),
        body: `Your application to "${itemName}" has been approved.`,
        data: {
          announcement_id: announcementId,
          application_id: applicationId,
          messageKey: 'applications.applicationApproved',
        },
        sendPush: true,
      });
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
    }

    return this.findOne(applicationId);
  }

  /**
   * Reject application (announcement owner or admin). Returns the updated application.
   */
  async reject(
    announcementId: string,
    applicationId: string,
    userId: string,
    userType?: string,
  ): Promise<Application> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const isAdmin = userType === UserType.ADMIN;
    if (!isAdmin && announcement.owner_id !== userId) {
      throw new ForbiddenException('Only the announcement owner can reject this application');
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
    await this.applicationRepository.update(applicationId, { status: ApplicationStatus.REJECTED });
    application.status = ApplicationStatus.REJECTED;

    // Notify only the applicant (owner of the application; no one else)
    try {
      const announcementWithItem = await this.announcementRepository.findOne({
        where: { id: announcementId },
        relations: ['item'],
      });
      const itemName = announcementWithItem?.item?.name_en || announcementWithItem?.item?.name_am || 'announcement';
      await this.notificationService.create({
        user_id: application.applicant_id,
        type: NotificationType.APPLICATION_REJECTED,
        title: getMessage('applications.applicationRejected', 'en'),
        body: `Your application to "${itemName}" has been rejected.`,
        data: {
          announcement_id: announcementId,
          application_id: applicationId,
          messageKey: 'applications.applicationRejected',
        },
        sendPush: true,
      });
    } catch (error) {
      this.logger.error('Failed to send notification:', error);
    }

    return this.findOne(applicationId);
  }

  /**
   * Update application status (with transition validation). Allowed for announcement owner or admin.
   */
  async updateStatus(
    announcementId: string,
    applicationId: string,
    newStatus: ApplicationStatus,
    userId: string,
    userType?: string,
  ): Promise<Application> {
    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    const isAdmin = userType === UserType.ADMIN;
    if (!isAdmin && announcement.owner_id !== userId) {
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
    await this.applicationRepository.update(applicationId, { status: newStatus });
    application.status = newStatus;

    // When closed via updateStatus, notify only the applicant (application owner)
    if (newStatus === ApplicationStatus.CLOSED) {
      try {
        const announcementWithItem = await this.announcementRepository.findOne({
          where: { id: announcementId },
          relations: ['item'],
        });
        const itemName = announcementWithItem?.item?.name_en || announcementWithItem?.item?.name_am || 'announcement';
        await this.notificationService.create({
          user_id: application.applicant_id,
          type: NotificationType.APPLICATION_CLOSED,
          title: getMessage('applications.applicationClosed', 'en'),
          body: `Your application to "${itemName}" has been closed.`,
          data: {
            announcement_id: announcementId,
            application_id: applicationId,
            messageKey: 'applications.applicationClosed',
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

    return this.findOne(applicationId);
  }

  /**
   * Close application. Allowed for:
   * - Admin or announcement owner (announcer): closes the application.
   * - Application owner (applicant): closes their own application (only when PENDING).
   */
  async close(
    announcementId: string,
    applicationId: string,
    userId: string,
    userType?: string,
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

    const isAdmin = userType === UserType.ADMIN;
    const isAnnouncementOwner = announcement.owner_id === userId;
    const isApplicationOwner = application.applicant_id === userId;

    if (isAdmin || isAnnouncementOwner) {
      return this.updateStatus(announcementId, applicationId, ApplicationStatus.CLOSED, userId, userType);
    }

    if (isApplicationOwner) {
      if (application.status !== ApplicationStatus.PENDING) {
        throw new BadRequestException(
          'Only pending applications can be closed by the applicant. Current status: ' + application.status,
        );
      }
      application.status = ApplicationStatus.CLOSED;
      await this.applicationRepository.update(applicationId, { status: ApplicationStatus.CLOSED });
      this.logger.log(`Application ${applicationId} closed by applicant`);
      return this.findOne(applicationId);
    }

    throw new ForbiddenException('Only the announcement owner or the application owner can close this application');
  }

  /**
   * Cancel application. Application owner (applicant) or admin can cancel.
   * Allowed when status is PENDING or APPROVED. Sets status to CANCELED.
   */
  async cancel(applicationId: string, userId: string, userType?: string): Promise<Application> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['announcement', 'announcement.item'],
    });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    const isAdmin = userType === UserType.ADMIN;
    if (!isAdmin && application.applicant_id !== userId) {
      throw new ForbiddenException('Only the application owner can cancel this application');
    }
    this.validateStatusTransition(application.status, ApplicationStatus.CANCELED);
    application.status = ApplicationStatus.CANCELED;
    await this.applicationRepository.update(applicationId, { status: ApplicationStatus.CANCELED });

    try {
      const itemName =
        application.announcement?.item?.name_en ||
        application.announcement?.item?.name_am ||
        'announcement';
      await this.notificationService.create({
        user_id: application.applicant_id,
        type: NotificationType.APPLICATION_CANCELED,
        title: getMessage('applications.applicationCanceled', 'en'),
        body: getMessage('applications.applicationCanceledBody', 'en'),
        data: {
          announcement_id: application.announcement_id,
          application_id: applicationId,
          messageKey: 'applications.applicationCanceled',
        },
        sendPush: true,
      });
    } catch (error) {
      this.logger.error('Failed to send application canceled notification:', error);
    }

    this.logger.log(`Application ${applicationId} canceled by applicant`);
    return this.findOne(applicationId);
  }

  /**
   * Daily system job:
   * Close PENDING applications only when ALL delivery_dates are before today.
   * If even one delivery date is today or in the future, the application stays pending.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  // @Cron(CronExpression.EVERY_10_SECONDS)
  async cancelExpiredPendingApplications(): Promise<void> {
    try {
      const expiredPending = await this.applicationRepository
        .createQueryBuilder('app')
        .select(['app.id'])
        .where('app.status = :status', { status: ApplicationStatus.PENDING })
        .andWhere('cardinality(app.delivery_dates) > 0')
        .andWhere(
          `NOT EXISTS (
             SELECT 1
             FROM unnest(app.delivery_dates) AS d
             WHERE d >= CURRENT_DATE
           )`,
        )
        .getMany();

      if (expiredPending.length === 0) {
        return;
      }

      const ids = expiredPending.map((a) => a.id);
      await this.applicationRepository
        .createQueryBuilder()
        .update(Application)
        .set({ status: ApplicationStatus.CLOSED })
        .whereInIds(ids)
        .execute();

      this.logger.log(
        `System auto-closed ${ids.length} pending application(s) — all delivery dates are in the past`,
      );
    } catch (error) {
      this.logger.error(
        `Failed daily auto-close for expired pending applications: ${error.message}`,
        error.stack,
      );
    }
  }
}

