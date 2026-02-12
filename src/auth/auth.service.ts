import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { DeviceToken } from '../entities/device-token.entity';
import { User, UserType, AccountStatus } from '../entities/user.entity';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';
import { OtpChannel } from '../entities/otp-code.entity';
import { OtpService } from '../common/services/otp.service';
import { AuthJwtService } from './jwt.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class AuthService {
  private readonly inactiveMonthsForAdminReview: number;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
    @InjectRepository(Region)
    private regionRepository: Repository<Region>,
    @InjectRepository(Village)
    private villageRepository: Repository<Village>,
    private otpService: OtpService,
    private jwtService: AuthJwtService,
    private configService: ConfigService,
  ) {
    this.inactiveMonthsForAdminReview = parseInt(
      this.configService.get('INACTIVE_MONTHS_FOR_ADMIN_REVIEW') || '12',
    );
  }

  /**
   * Hash password using bcrypt
   */
  private async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  private async verifyPassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Check if user account is inactive (last active > X months)
   */
  private isAccountInactive(user: User): boolean {
    if (!user.last_active_at) {
      return true; // Never active
    }

    const monthsAgo = new Date();
    monthsAgo.setMonth(monthsAgo.getMonth() - this.inactiveMonthsForAdminReview);

    return user.last_active_at < monthsAgo;
  }

  /**
   * Validate region_id and village_id exist in database
   */
  private async validateRegionAndVillage(regionId?: string, villageId?: string): Promise<{ validRegionId: string | null; validVillageId: string | null }> {
    let validRegionId: string | null = null;
    let validVillageId: string | null = null;

    // Validate region_id if provided
    if (regionId) {
      const region = await this.regionRepository.findOne({ where: { id: regionId } });
      if (!region) {
        throw new BadRequestException(`Region with ID ${regionId} not found`);
      }
      validRegionId = regionId;
    }

    // Validate village_id if provided
    if (villageId) {
      const village = await this.villageRepository.findOne({ where: { id: villageId } });
      if (!village) {
        throw new BadRequestException(`Village with ID ${villageId} not found`);
      }
      
      // If region_id is also provided, verify village belongs to that region
      if (validRegionId && village.region_id !== validRegionId) {
        throw new BadRequestException(`Village ${villageId} does not belong to region ${validRegionId}`);
      }
      
      validVillageId = villageId;
    }

    return { validRegionId, validVillageId };
  }

  /**
   * Register a new user
   * - If user exists and is verified: return "user exists"
   * - If user exists but NOT verified: update credentials and allow OTP verification
   * - If user doesn't exist: create new user
   * - Validates company name uniqueness (for Company type)
   * - Validates region_id and village_id exist
   * - Hashes password
   * - Sets verified status based on user type
   */
  async register(registerDto: RegisterDto): Promise<{ message: string; user: Partial<User>; otp_code?: string }> {
    const { phone, full_name, password, user_type, phones, emails, profile_picture, region_id, village_id, terms_accepted = true } = registerDto;

    // Check terms acceptance (defaults to true if not provided)
    if (terms_accepted === false) {
      throw new BadRequestException('Terms not accepted');
    }

    // Validate region_id and village_id if provided
    const { validRegionId, validVillageId } = await this.validateRegionAndVillage(region_id, village_id);

    // Check if phone already exists
    const existingUserByPhone = await this.userRepository.findOne({
      where: { phone },
    });

    // If user exists and is verified, return 409 Conflict
    if (existingUserByPhone && existingUserByPhone.verified) {
      throw new ConflictException('User already exists');
    }

    // If user exists but NOT verified, update with new credentials (same logic for all user types)
    if (existingUserByPhone && !existingUserByPhone.verified) {
      // Hash new password
      const hashedPassword = await this.hashPassword(password);

      // Update user with new credentials (same for company and farmer)
      existingUserByPhone.full_name = full_name;
      existingUserByPhone.password = hashedPassword;
      existingUserByPhone.user_type = user_type;
      existingUserByPhone.phones = phones || existingUserByPhone.phones || [];
      existingUserByPhone.emails = emails || existingUserByPhone.emails || [];
      existingUserByPhone.profile_picture = profile_picture || existingUserByPhone.profile_picture;
      existingUserByPhone.region_id = validRegionId !== null ? validRegionId : existingUserByPhone.region_id;
      existingUserByPhone.village_id = validVillageId !== null ? validVillageId : existingUserByPhone.village_id;
      
      // Reset verified status (will be set after OTP verification)
      existingUserByPhone.verified = false;
      
      // Update account status based on user type
      existingUserByPhone.account_status = user_type === UserType.COMPANY 
        ? AccountStatus.PENDING 
        : AccountStatus.ACTIVE;

      const updatedUser = await this.userRepository.save(existingUserByPhone);

      // Automatically send OTP after updating user
      let otpCode: string | undefined;
      try {
        const otpResult = await this.otpService.sendOtp(phone, OtpChannel.SMS, 'registration');
        otpCode = otpResult.otp_code;
      } catch (error) {
        // Log error but don't fail registration if OTP sending fails
        console.error('Failed to send OTP after user update:', error);
      }

      // Load relations for response
      const userWithRelations = await this.userRepository.findOne({
        where: { id: updatedUser.id },
        relations: ['region', 'village'],
      });

      // Remove password from response
      const { password: __, ...userWithoutPassword } = userWithRelations || updatedUser;

      // Ensure verified is false in response
      userWithoutPassword.verified = false;

      // Return message - same for all user types
      return {
        message: 'User updated. Please verify OTP',
        user: userWithoutPassword,
        otp_code: otpCode,
      };
    }

    // For Company type, check if company name already exists (only for new registrations)
    if (user_type === UserType.COMPANY) {
      const existingCompany = await this.userRepository.findOne({
        where: { full_name, user_type: UserType.COMPANY },
      });

      // Only throw error if company exists with different phone (duplicate company name)
      if (existingCompany && existingCompany.phone !== phone) {
        throw new ConflictException('Duplicate company');
      }
    }

    // Hash password
    const hashedPassword = await this.hashPassword(password);

    // Create user
    const user = this.userRepository.create({
      phone,
      full_name,
      password: hashedPassword,
      user_type,
      phones: phones || [],
      emails: emails || [],
      profile_picture: profile_picture || null,
      region_id: validRegionId,
      village_id: validVillageId,
      account_status: user_type === UserType.COMPANY ? AccountStatus.PENDING : AccountStatus.ACTIVE,
      terms_accepted: terms_accepted ?? true, // Default to true if not provided
      verified: user_type === UserType.FARMER ? false : false, // Both need OTP/admin verification
      is_locked: false,
    });

    const savedUser = await this.userRepository.save(user);

    // Automatically send OTP after creating user
    let otpCode: string | undefined;
    try {
      const otpResult = await this.otpService.sendOtp(phone, OtpChannel.SMS, 'registration');
      otpCode = otpResult.otp_code;
    } catch (error) {
      // Log error but don't fail registration if OTP sending fails
      console.error('Failed to send OTP after registration:', error);
    }

    // Load relations for response
    const userWithRelations = await this.userRepository.findOne({
      where: { id: savedUser.id },
      relations: ['region', 'village'],
    });

    // Remove password from response
    const { password: _, ...userWithoutPassword } = userWithRelations || savedUser;

    // Ensure verified is false in response
    userWithoutPassword.verified = false;

    // Return appropriate message based on user type
    if (user_type === UserType.COMPANY) {
      return {
        message: 'Awaiting verification',
        user: userWithoutPassword,
        otp_code: otpCode,
      };
    }

    return {
      message: 'Registration success',
      user: userWithoutPassword,
      otp_code: otpCode,
    };
  }

  /**
   * Send OTP to phone number
   */
  async sendOtp(phone: string, channel?: OtpChannel, purpose?: string): Promise<{ success: boolean; message: string; otp_code?: string }> {
    const result = await this.otpService.sendOtp(
      phone,
      channel || OtpChannel.SMS,
      purpose,
    );
    return {
      success: result.success,
      message: result.message,
      otp_code: result.otp_code,
    };
  }

  /**
   * Verify OTP code
   * - Verifies OTP
   * - For Farmer: marks account as verified after OTP verification
   * - For Company: still requires admin verification (account_status must be active)
   * - Generates and returns access token and refresh token (same as login)
   */
  async verifyOtp(phone: string, code: string, purpose?: string): Promise<{ 
    message: string; 
    user: Partial<User>;
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    // Verify OTP
    await this.otpService.verifyOtp(phone, code, purpose);

    // Find user
    const user = await this.userRepository.findOne({ where: { phone } });
    
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if account is locked
    if (user.is_locked) {
      throw new UnauthorizedException('Account is locked. Please contact admin.');
    }

    // If purpose is registration, mark user as verified (for Farmer only)
    if (purpose === 'registration') {
      if (user.user_type === UserType.FARMER) {
        user.verified = true;
      }
      // Company still needs admin verification, so verified stays false
    }

    // For companies, check account status
    if (user.user_type === UserType.COMPANY) {
      if (user.account_status === AccountStatus.BLOCKED) {
        throw new UnauthorizedException('Account is blocked. Please contact admin.');
      }
    }

    // Generate tokens
    const tokens = await this.jwtService.generateTokens(user);

    // Save refresh token to database
    user.refresh_token = tokens.refresh_token;
    user.last_login_at = new Date();
    user.last_active_at = new Date();
    await this.userRepository.save(user);

    // Try to load relations for response (optional, won't fail if relations don't exist)
    let userWithRelations: User | null = null;
    try {
      userWithRelations = await this.userRepository.findOne({
        where: { id: user.id },
        relations: ['region', 'village'],
      });
    } catch (error) {
      // If relations fail to load, just use the user without relations
      console.warn('Failed to load user relations:', error);
    }

    // Remove password and refresh_token from response
    const { password: _, refresh_token: __, ...userWithoutSecrets } = userWithRelations || user;

    // Determine message based on user type and verification status
    let message = 'OTP verified successfully';
    if (purpose === 'registration') {
      if (user.user_type === UserType.FARMER) {
        message = 'OTP verified successfully. Account is now verified.';
      } else if (user.user_type === UserType.COMPANY) {
        message = 'OTP verified successfully. Awaiting admin verification.';
      }
    }

    return {
      message,
      user: userWithoutSecrets,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
    };
  }

  /**
   * Update user profile
   * - Users can only update themselves
   * - Admins can update any user
   * - Validates region_id and village_id if provided
   * - Checks for duplicate phone numbers in phones array
   * - Updates only provided fields
   * - Filters out all auth-related fields from response
   */
  async updateUser(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<{ message: string; user: Partial<User> }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException(`User with ID ${userId} not found`);
    }

    // Check for duplicate phone numbers in phones array if provided
    if (updateUserDto.phones !== undefined && updateUserDto.phones.length > 0) {
      // Check for duplicates within the array itself
      const uniquePhones = [...new Set(updateUserDto.phones)];
      if (uniquePhones.length !== updateUserDto.phones.length) {
        throw new BadRequestException('Duplicate phone numbers found in phones array');
      }

      // Check if any phone in the array already exists as primary phone for another user
      // (excluding the current user's primary phone - that's allowed)
      for (const phone of updateUserDto.phones) {
        // Skip check if it's the user's own primary phone
        if (phone === user.phone) {
          continue;
        }

        const existingUser = await this.userRepository.findOne({
          where: { phone },
        });
        
        if (existingUser && existingUser.id !== userId) {
          throw new ConflictException(`Phone number ${phone} is already in use by another user`);
        }
      }
    }

    // Validate region_id and village_id if provided
    const { validRegionId, validVillageId } = await this.validateRegionAndVillage(
      updateUserDto.region_id,
      updateUserDto.village_id,
    );

    // Update only provided fields
    if (updateUserDto.full_name !== undefined) {
      user.full_name = updateUserDto.full_name;
    }
    if (updateUserDto.phones !== undefined) {
      user.phones = updateUserDto.phones;
    }
    if (updateUserDto.emails !== undefined) {
      user.emails = updateUserDto.emails;
    }
    if (updateUserDto.profile_picture !== undefined) {
      user.profile_picture = updateUserDto.profile_picture || null;
    }
    if (validRegionId !== null) {
      user.region_id = validRegionId;
    }
    if (validVillageId !== null) {
      user.village_id = validVillageId;
    }

    const updatedUser = await this.userRepository.save(user);

    // Load relations for response
    const userWithRelations = await this.userRepository.findOne({
      where: { id: updatedUser.id },
      relations: ['region', 'village'],
    });

    // Filter out all auth-related sensitive fields from response
    const {
      password: _,
      refresh_token: __,
      ...userWithoutSecrets
    } = userWithRelations || updatedUser;

    return {
      message: 'User updated successfully',
      user: userWithoutSecrets,
    };
  }

  /**
   * Login with phone and password
   * - Validates credentials
   * - Checks if user is verified (blocks unverified users)
   * - Checks if account is locked
   * - Updates last login and active timestamps
   * - Returns access token and refresh token
   */
  async login(loginDto: LoginDto): Promise<{ 
    message: string; 
    user: Partial<User>;
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    try {
      const { phone, password } = loginDto;

      // Find user
      const user = await this.userRepository.findOne({ where: { phone } });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Check if user is verified - BLOCK unverified users
      if (!user.verified) {
        throw new UnauthorizedException('Account not verified. Please verify your account with OTP first.');
      }

      // Check if account is locked
      if (user.is_locked) {
        throw new UnauthorizedException('Account is locked. Please contact admin.');
      }

      // For companies, check account status
      if (user.user_type === UserType.COMPANY) {
        if (user.account_status === AccountStatus.PENDING) {
          throw new UnauthorizedException('Account is pending admin review. Please wait for verification.');
        }
        if (user.account_status === AccountStatus.BLOCKED) {
          throw new UnauthorizedException('Account is blocked. Please contact admin.');
        }
        // Account must be active and verified to login
        if (user.account_status !== AccountStatus.ACTIVE) {
          throw new UnauthorizedException('Account is not active. Please contact admin.');
        }
      }

      // Verify password
      const isPasswordValid = await this.verifyPassword(password, user.password);

      if (!isPasswordValid) {
        throw new UnauthorizedException('Invalid phone or password');
      }

      // Generate tokens
      const tokens = await this.jwtService.generateTokens(user);

      // Save refresh token to database
      user.refresh_token = tokens.refresh_token;
      user.last_login_at = new Date();
      user.last_active_at = new Date();
      await this.userRepository.save(user);

      // Save FCM token and device info if provided
      if (loginDto.fcm_token) {
        try {
          // Check if device token already exists for this user and FCM token
          let deviceToken = await this.deviceTokenRepository.findOne({
            where: {
              user_id: user.id,
              fcm_token: loginDto.fcm_token,
            },
          });

          if (deviceToken) {
            // Update existing token
            deviceToken.device_id = loginDto.device_id || deviceToken.device_id;
            deviceToken.device_type = loginDto.device_type || deviceToken.device_type;
            deviceToken.device_model = loginDto.device_model || deviceToken.device_model;
            deviceToken.os_version = loginDto.os_version || deviceToken.os_version;
            deviceToken.app_version = loginDto.app_version || deviceToken.app_version;
            deviceToken.is_active = true;
            await this.deviceTokenRepository.save(deviceToken);
          } else {
            // Create new device token
            deviceToken = this.deviceTokenRepository.create({
              user_id: user.id,
              fcm_token: loginDto.fcm_token,
              device_id: loginDto.device_id || null,
              device_type: loginDto.device_type || null,
              device_model: loginDto.device_model || null,
              os_version: loginDto.os_version || null,
              app_version: loginDto.app_version || null,
              is_active: true,
            });
            await this.deviceTokenRepository.save(deviceToken);
          }

          // Deactivate old tokens for the same device_id (if provided)
          if (loginDto.device_id) {
            const oldTokens = await this.deviceTokenRepository.find({
              where: {
                user_id: user.id,
                device_id: loginDto.device_id,
              },
            });
            
            for (const oldToken of oldTokens) {
              if (oldToken.id !== deviceToken.id) {
                oldToken.is_active = false;
                await this.deviceTokenRepository.save(oldToken);
              }
            }
          }
        } catch (error) {
          // Log error but don't fail login if FCM token saving fails
          console.error('Failed to save FCM token:', error);
        }
      }

      // Try to load relations for response (optional, won't fail if relations don't exist)
      let userWithRelations: User | null = null;
      try {
        userWithRelations = await this.userRepository.findOne({
          where: { id: user.id },
          relations: ['region', 'village'],
        });
      } catch (error) {
        // If relations fail to load, just use the user without relations
        console.warn('Failed to load user relations:', error);
      }

      // Remove password and refresh_token from response
      const { password: _, refresh_token: __, ...userWithoutSecrets } = userWithRelations || user;

      return {
        message: 'Login successful',
        user: userWithoutSecrets,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in,
      };
    } catch (error) {
      // Re-throw UnauthorizedException as-is (these are expected errors)
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      // Log unexpected errors and throw a generic message
      console.error('Login error:', error);
      throw new UnauthorizedException('Login failed. Please try again.');
    }
  }

  /**
   * Initiate forgot password flow
   * - Checks if user exists
   * - Sends OTP
   * - For inactive accounts (>12 months), requires admin review
   */
  async forgotPassword(phone: string): Promise<{ message: string; requiresAdminReview: boolean }> {
    const user = await this.userRepository.findOne({ where: { phone } });

    if (!user) {
      // Don't reveal if user exists for security
      return {
        message: 'If the phone number exists, an OTP has been sent',
        requiresAdminReview: false,
      };
    }

    // Check if account is inactive
    const isInactive = this.isAccountInactive(user);

    if (isInactive) {
      return {
        message: 'Account inactive. Admin review required for password reset.',
        requiresAdminReview: true,
      };
    }

    // Send OTP for password reset
    await this.otpService.sendOtp(phone, OtpChannel.SMS, 'forgot_password');

    return {
      message: 'OTP sent for password reset',
      requiresAdminReview: false,
    };
  }

  /**
   * Reset password with OTP verification
   * - Verifies OTP
   * - Updates password
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { phone, otp_code, new_password } = resetPasswordDto;

    // Verify OTP
    await this.otpService.verifyOtp(phone, otp_code, 'forgot_password');

    // Find user
    const user = await this.userRepository.findOne({ where: { phone } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if account is locked
    if (user.is_locked) {
      throw new BadRequestException('Account is locked. Please contact admin.');
    }

    // Hash and update password
    const hashedPassword = await this.hashPassword(new_password);
    user.password = hashedPassword;
    user.last_active_at = new Date();
    await this.userRepository.save(user);

    return { message: 'Password reset successfully' };
  }

  /**
   * Refresh access token using refresh token
   * - Verifies refresh token
   * - Checks if token matches stored refresh token
   * - Generates new access token
   */
  async refreshToken(refreshToken: string): Promise<{
    access_token: string;
    expires_in: number;
  }> {
    try {
      // Verify refresh token
      const payload = await this.jwtService.verifyRefreshToken(refreshToken);

      // Find user by ID from token
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Check if refresh token matches stored token
      if (user.refresh_token !== refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Check if user is still verified
      if (!user.verified) {
        throw new UnauthorizedException('Account not verified');
      }

      // Check if account is locked
      if (user.is_locked) {
        throw new UnauthorizedException('Account is locked');
      }

      // Generate new access token
      const tokens = await this.jwtService.refreshAccessToken(refreshToken);

      return {
        access_token: tokens.access_token,
        expires_in: tokens.expires_in,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}

