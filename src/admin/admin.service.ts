import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserType, AccountStatus } from '../entities/user.entity';
import { UnlockUserDto } from './dto/unlock-user.dto';
import { VerifyCompanyDto } from './dto/verify-company.dto';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../entities/notification.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private notificationService: NotificationService,
  ) {}

  /**
   * Unlock or lock a user account
   * - Finds user by phone
   * - Updates lock status
   * - Can be used for manual recovery
   */
  async unlockUser(unlockUserDto: UnlockUserDto): Promise<{ message: string; user: Partial<User> }> {
    const { phone, unlock = true, reason } = unlockUserDto;

    const user = await this.userRepository.findOne({ where: { phone } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update lock status
    user.is_locked = !unlock;
    await this.userRepository.save(user);

    // In production, you would log this action for audit purposes
    console.log(`Admin action: User ${phone} ${unlock ? 'unlocked' : 'locked'}. Reason: ${reason || 'N/A'}`);

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      message: `User ${unlock ? 'unlocked' : 'locked'} successfully`,
      user: userWithoutPassword,
    };
  }

  /**
   * Verify or reject a company account
   * - Finds company by phone
   * - Updates verified status and account status
   * - Used for admin review of company registrations
   */
  async verifyCompany(verifyCompanyDto: VerifyCompanyDto): Promise<{ message: string; user: Partial<User> }> {
    const { phone, verified = true, account_status, reason } = verifyCompanyDto;

    const user = await this.userRepository.findOne({ where: { phone } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if user is a company
    if (user.user_type !== UserType.COMPANY) {
      throw new BadRequestException('User is not a company account');
    }

    // Update verified status
    user.verified = verified;

    // Update account status
    // If account_status is provided, use it
    // Otherwise, set based on verified status:
    // - verified = true -> active
    // - verified = false -> blocked
    if (account_status) {
      user.account_status = account_status;
    } else {
      user.account_status = verified ? AccountStatus.ACTIVE : AccountStatus.BLOCKED;
    }

    await this.userRepository.save(user);

    // In production, you would log this action for audit purposes
    console.log(`Admin action: Company ${phone} ${verified ? 'verified' : 'rejected'}, status: ${user.account_status}. Reason: ${reason || 'N/A'}`);

    // Send notification to user about account status change
    try {
      const { title, body } = this.getAccountStatusNotificationContent(user.account_status);
      await this.notificationService.create({
        user_id: user.id,
        type: NotificationType.ACCOUNT_STATUS_CHANGED,
        title,
        body,
        data: {
          account_status: user.account_status,
          reason: reason || '',
        },
        sendPush: true,
      });
    } catch (error) {
      console.error('Failed to send account status notification:', error);
      // Don't fail the admin action if notification fails
    }

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      message: `Company ${verified ? 'verified' : 'rejected'} successfully`,
      user: userWithoutPassword,
    };
  }

  /**
   * Get notification title and body for account status change
   */
  private getAccountStatusNotificationContent(
    status: AccountStatus,
  ): { title: string; body: string } {
    switch (status) {
      case AccountStatus.ACTIVE:
        return {
          title: 'Account activated',
          body: 'Your company account has been verified and activated. You can now use all features.',
        };
      case AccountStatus.BLOCKED:
        return {
          title: 'Account blocked',
          body: 'Your company account has been blocked. Please contact support for more information.',
        };
      case AccountStatus.PENDING:
        return {
          title: 'Account under review',
          body: 'Your company account is under review. You will be notified when the review is complete.',
        };
      default:
        return {
          title: 'Account status updated',
          body: `Your account status has been updated to: ${status}.`,
        };
    }
  }

  /**
   * Get all users requiring admin review
   * - Companies with pending status
   * - Companies that are not verified
   * - Locked accounts
   * - Inactive accounts
   */
  async getUsersRequiringReview(): Promise<{ users: Partial<User>[] }> {
    // Companies with pending status
    const pendingCompanies = await this.userRepository.find({
      where: {
        user_type: UserType.COMPANY,
        account_status: AccountStatus.PENDING,
      },
    });

    // Companies awaiting verification
    const unverifiedCompanies = await this.userRepository.find({
      where: {
        user_type: UserType.COMPANY,
        verified: false,
      },
    });

    // Locked accounts
    const lockedAccounts = await this.userRepository.find({
      where: {
        is_locked: true,
      },
    });

    // Combine and remove duplicates
    const allUsers = [...pendingCompanies, ...unverifiedCompanies, ...lockedAccounts];
    const uniqueUsers = Array.from(
      new Map(allUsers.map((user) => [user.id, user])).values(),
    );

    // Remove passwords
    const usersWithoutPasswords = uniqueUsers.map(({ password: _, ...user }) => user);

    return { users: usersWithoutPasswords };
  }
}

