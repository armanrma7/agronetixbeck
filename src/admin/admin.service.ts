import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserType, AccountStatus } from '../entities/user.entity';
import { UnlockUserDto } from './dto/unlock-user.dto';
import { VerifyCompanyDto } from './dto/verify-company.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
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

    // Remove password from response
    const { password: _, ...userWithoutPassword } = user;

    return {
      message: `Company ${verified ? 'verified' : 'rejected'} successfully`,
      user: userWithoutPassword,
    };
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

