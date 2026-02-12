import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { OtpCode, OtpChannel } from '../../entities/otp-code.entity';
import { SmsService } from '../../sms/sms.service';

@Injectable()
export class OtpService {
  private readonly otpExpirySeconds: number;
  private readonly otpMaxAttempts: number;
  private readonly otpLength: number;

  constructor(
    @InjectRepository(OtpCode)
    private otpRepository: Repository<OtpCode>,
    private smsService: SmsService,
    private configService: ConfigService,
  ) {
    this.otpExpirySeconds = parseInt(
      this.configService.get('OTP_EXPIRY_SECONDS') || '60',
    );
    this.otpMaxAttempts = parseInt(
      this.configService.get('OTP_MAX_ATTEMPTS') || '5',
    );
    this.otpLength = parseInt(this.configService.get('OTP_LENGTH') || '6');
  }

  /**
   * Generate a random 6-digit numeric OTP
   */
  private generateOtp(): string {
    const min = 100000;
    const max = 999999;
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  /**
   * Hash OTP code before storing
   */
  private async hashOtp(otp: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(otp, saltRounds);
  }

  /**
   * Verify OTP code against hashed version
   */
  private async verifyOtpCode(plainOtp: string, hashedOtp: string): Promise<boolean> {
    return bcrypt.compare(plainOtp, hashedOtp);
  }

  /**
   * Send OTP to phone number
   * - Generates 6-digit OTP
   * - Updates existing unexpired OTP if exists, otherwise creates new one
   * - Hashes and stores OTP with expiry
   * - Sends via SMS provider
   * - Returns OTP code for registration response
   */
  async sendOtp(
    phone: string,
    channel: OtpChannel = OtpChannel.SMS,
    purpose?: string,
  ): Promise<{ success: boolean; message: string; otp_code?: string }> {
    // Clean up expired OTPs
    await this.cleanupExpiredOtps();

    const now = new Date();
    const purposeValue = purpose || 'verification';

    // Check for existing unexpired, unverified OTP for this phone and purpose
    const existingOtp = await this.otpRepository.findOne({
      where: {
        phone,
        verified: false,
        purpose: purposeValue,
      },
      order: { created_at: 'DESC' },
    });

    // Generate new OTP
    const otpCode = this.generateOtp();
    const hashedOtp = await this.hashOtp(otpCode);

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + this.otpExpirySeconds);

    let otpRecord: OtpCode;

    // If there's an existing unexpired OTP, update it instead of creating new one
    if (existingOtp && existingOtp.expires_at > now) {
      // Update existing OTP with new code and reset attempts
      existingOtp.hashed_code = hashedOtp;
      existingOtp.expires_at = expiresAt;
      existingOtp.attempts = 0;
      existingOtp.channel = channel;
      existingOtp.verified = false;
      otpRecord = await this.otpRepository.save(existingOtp);
    } else {
      // Create new OTP record
      otpRecord = this.otpRepository.create({
        phone,
        hashed_code: hashedOtp,
        channel,
        expires_at: expiresAt,
        purpose: purposeValue,
        attempts: 0,
        verified: false,
      });
      await this.otpRepository.save(otpRecord);
    }

    // Send OTP via SmsService (MSG91)
    // Only send via SMS channel, other channels can be added later
    let smsSuccess = false;
    if (channel === OtpChannel.SMS) {
      try {
        const smsResult = await this.smsService.sendOtp(phone, otpCode);
        
        if (!smsResult.success) {
          // Log error but don't fail OTP creation
          console.error('Failed to send OTP via SMS service:', smsResult.error);
          smsSuccess = false;
        } else {
          console.log(`OTP sent successfully to ${phone}. Response ID: ${smsResult.responseId}`);
          smsSuccess = true;
        }
      } catch (error) {
        // If SMS sending fails, return false
        console.error('Failed to send OTP via SMS service:', error);
        smsSuccess = false;
      }
    } else {
      // For other channels (Viber, WhatsApp, Telegram), log warning
      console.warn(`Channel ${channel} not yet implemented. OTP generated but not sent.`);
      smsSuccess = false;
    }

    return {
      success: smsSuccess,
      message: smsSuccess ? 'OTP sent successfully' : 'OTP generated but failed to send via SMS',
      otp_code: otpCode, 
    };
  }

  /**
   * Verify OTP code
   * - Checks expiry
   * - Checks attempts
   * - Verifies code
   * - Marks as verified
   */
  async verifyOtp(
    phone: string,
    code: string,
    purpose?: string,
  ): Promise<{ success: boolean; message: string }> {
    // Find the most recent unverified OTP for this phone
    const otpRecord = await this.otpRepository.findOne({
      where: {
        phone,
        verified: false,
        purpose: purpose || 'verification',
      },
      order: { created_at: 'DESC' },
    });

    if (!otpRecord) {
      throw new BadRequestException('OTP not found or already verified');
    }

    // Check if OTP has expired
    if (new Date() > otpRecord.expires_at) {
      throw new BadRequestException('OTP expired');
    }

    // Check max attempts
    if (otpRecord.attempts >= this.otpMaxAttempts) {
      throw new BadRequestException('Maximum verification attempts exceeded');
    }

    // Verify OTP code
    const isValid = await this.verifyOtpCode(code, otpRecord.hashed_code);
    otpRecord.attempts += 1;

    if (!isValid) {
      await this.otpRepository.save(otpRecord);
      throw new BadRequestException('Wrong OTP');
    }

    // Mark as verified
    otpRecord.verified = true;
    await this.otpRepository.save(otpRecord);

    return {
      success: true,
      message: 'OTP verified successfully',
    };
  }

  /**
   * Clean up expired OTPs from database
   * - Removes expired OTPs (expires_at < now)
   * - Removes old verified OTPs (verified = true and created_at > 24 hours ago)
   */
  private async cleanupExpiredOtps(): Promise<void> {
    const now = new Date();
    
    // Delete expired OTPs
    await this.otpRepository.delete({
      expires_at: LessThan(now),
    });

    // Delete old verified OTPs (older than 24 hours)
    const oneDayAgo = new Date();
    oneDayAgo.setHours(oneDayAgo.getHours() - 24);
    
    await this.otpRepository
      .createQueryBuilder()
      .delete()
      .from(OtpCode)
      .where('verified = :verified', { verified: true })
      .andWhere('created_at < :oneDayAgo', { oneDayAgo })
      .execute();
  }

  /**
   * Get the latest OTP record for a phone (for verification purposes)
   */
  async getLatestOtp(phone: string, purpose?: string): Promise<OtpCode | null> {
    return this.otpRepository.findOne({
      where: {
        phone,
        purpose: purpose || 'verification',
      },
      order: { created_at: 'DESC' },
    });
  }
}

