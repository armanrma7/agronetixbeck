import {
  Injectable,
  BadRequestException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { OtpCode, OtpChannel } from '../../entities/otp-code.entity';
import { SmsService } from '../../sms/sms.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  /** How long (seconds) an OTP code stays valid for verification */
  private readonly otpExpirySeconds: number;
  /** Max wrong guesses before the OTP is locked */
  private readonly otpMaxAttempts: number;
  /** Max total sends (initial + resends) allowed in 1 hour per phone */
  private readonly maxSendsPerHour: number;
  /** Rate-limit window in milliseconds (default 1 hour) */
  private readonly rateLimitWindowMs: number = 60 * 60 * 1000;

  constructor(
    @InjectRepository(OtpCode)
    private otpRepository: Repository<OtpCode>,
    private smsService: SmsService,
    private configService: ConfigService,
  ) {
    this.otpExpirySeconds = parseInt(
      this.configService.get('OTP_EXPIRY_SECONDS') || '300', // 5 min default
    );
    this.otpMaxAttempts = parseInt(
      this.configService.get('OTP_MAX_ATTEMPTS') || '5',
    );
    // Initial send counts as 1, so max resends = maxSendsPerHour - 1
    // Default: 4 total (initial + 3 resends) as requested
    this.maxSendsPerHour = parseInt(
      this.configService.get('OTP_MAX_SENDS_PER_HOUR') || '4',
    );
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async hashOtp(otp: string): Promise<string> {
    return bcrypt.hash(otp, 10);
  }

  private async verifyOtpHash(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  /**
   * Find the most-recent OTP record for this phone+purpose created within the
   * last rate-limit window (1 hour). This record is used for both rate-limiting
   * and as the active OTP to re-send / verify against.
   */
  private async findRecentRecord(phone: string, purpose: string): Promise<OtpCode | null> {
    const windowStart = new Date(Date.now() - this.rateLimitWindowMs);
    return this.otpRepository.findOne({
      where: { phone, purpose, created_at: MoreThan(windowStart) },
      order: { created_at: 'DESC' },
    });
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Send (or resend) an OTP to a phone number via Twilio SMS.
   *
   * Rules enforced:
   *  - Max 4 total sends per phone per 1-hour window (initial + 3 resends).
   *  - After 4 sends the phone is blocked until the 1-hour window expires.
   *  - "Registering again" during the same window hits the same counter.
   *  - The 6-digit code is stored hashed in the DB.
   */
  async sendOtp(
    phone: string,
    _channel: OtpChannel = OtpChannel.SMS,
    purpose?: string,
  ): Promise<{ success: boolean; message: string }> {
    const purposeValue = purpose || 'registration';
    this.logger.log(`sendOtp: phone=${phone}, purpose=${purposeValue}`);

    // Clean up stale records first (> 1 hr old regardless of status)
    await this.cleanupOldRecords();

    // ── Rate limiting ───────────────────────────────────────────────────────
    const recent = await this.findRecentRecord(phone, purposeValue);

    if (recent) {
      const totalSends = recent.resend_count + 1; // +1 for the initial send
      this.logger.log(
        `sendOtp: found recent record id=${recent.id}, totalSends=${totalSends}/${this.maxSendsPerHour}`,
      );

      if (totalSends >= this.maxSendsPerHour) {
        const windowExpiry = new Date(recent.created_at.getTime() + this.rateLimitWindowMs);
        const minutesLeft = Math.ceil((windowExpiry.getTime() - Date.now()) / 60_000);
        this.logger.warn(`sendOtp: rate limit hit for ${phone}. Wait ${minutesLeft} min.`);
        throw new BadRequestException(
          `Too many OTP requests. You can request a new code in ${minutesLeft} minute(s).`,
        );
      }
    }

    // ── Generate & store OTP ────────────────────────────────────────────────
    const otpCode = this.generateOtp();
    const hashedCode = await this.hashOtp(otpCode);
    const expiresAt = new Date(Date.now() + this.otpExpirySeconds * 1000);

    if (recent) {
      // Update existing record: new code + expiry, increment resend counter, reset attempts
      recent.hashed_code = hashedCode;
      recent.expires_at = expiresAt;
      recent.resend_count += 1;
      recent.attempts = 0;
      recent.verified = false;
      await this.otpRepository.save(recent);
      this.logger.log(
        `sendOtp: updated record id=${recent.id}, resend_count=${recent.resend_count}`,
      );
    } else {
      // First send in this window — create new record
      const record = this.otpRepository.create({
        phone,
        hashed_code: hashedCode,
        channel: OtpChannel.SMS,
        expires_at: expiresAt,
        purpose: purposeValue,
        attempts: 0,
        resend_count: 0,
        verified: false,
      });
      await this.otpRepository.save(record);
      this.logger.log(`sendOtp: created new OTP record for ${phone}`);
    }

    // ── Send SMS via Twilio ─────────────────────────────────────────────────
    const smsResult = await this.smsService.sendOtp(phone, otpCode);
    if (!smsResult.success) {
      this.logger.error(`sendOtp: Twilio failed for ${phone}: ${smsResult.error}`);
      throw new ServiceUnavailableException(
        `Failed to send OTP SMS: ${smsResult.error}`,
      );
    }

    const sendsUsed = recent ? recent.resend_count + 1 : 1;
    const resendsLeft = this.maxSendsPerHour - sendsUsed - 1; // -1 for initial
    this.logger.log(`sendOtp: SMS sent to ${phone}. Resends remaining: ${Math.max(0, resendsLeft)}`);

    return {
      success: true,
      message: `OTP sent to ${phone}. You have ${Math.max(0, resendsLeft)} resend(s) remaining.`,
    };
  }

  /**
   * Verify an OTP code for a phone number.
   *
   * Rules:
   *  - Checks expiry.
   *  - Checks max wrong-attempt count.
   *  - On success: the OTP record is DELETED (code is consumed).
   *  - On wrong code: increments attempts counter and throws.
   */
  async verifyOtp(
    phone: string,
    code: string,
    purpose?: string,
  ): Promise<{ success: boolean; message: string }> {
    this.logger.log(`verifyOtp: phone=${phone}, purpose=${purpose ?? 'any'}`);

    // Find the active (unverified) record.
    // If a purpose is explicitly provided, match it; otherwise find any active OTP for this phone
    // so callers don't need to track which purpose was used when sending.
    const record = await this.otpRepository.findOne({
      where: purpose
        ? { phone, verified: false, purpose }
        : { phone, verified: false },
      order: { created_at: 'DESC' },
    });

    if (!record) {
      this.logger.warn(`verifyOtp: no active OTP for phone=${phone}, purpose=${purpose ?? 'any'}`);
      throw new BadRequestException('No active OTP found. Please request a new code.');
    }

    // Expiry check
    if (new Date() > record.expires_at) {
      this.logger.warn(`verifyOtp: OTP expired for ${phone}`);
      throw new BadRequestException('OTP has expired. Please request a new code.');
    }

    // Max wrong attempts
    if (record.attempts >= this.otpMaxAttempts) {
      this.logger.warn(`verifyOtp: max attempts reached for ${phone}`);
      throw new BadRequestException(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    // Verify the code
    const isValid = await this.verifyOtpHash(code, record.hashed_code);
    if (!isValid) {
      record.attempts += 1;
      await this.otpRepository.save(record);
      const attemptsLeft = this.otpMaxAttempts - record.attempts;
      this.logger.warn(`verifyOtp: wrong code for ${phone}. Attempts left: ${attemptsLeft}`);
      throw new BadRequestException(
        `Wrong OTP code. ${attemptsLeft} attempt(s) remaining.`,
      );
    }

    // ── Success: delete the record (code consumed) ──────────────────────────
    // Note: the rate-limit window is tracked by created_at. The record is gone,
    // but if a new sendOtp is called within the same hour for the same phone,
    // no recent record will be found and a fresh window starts.
    // This is intentional: successful verification resets the rate-limit counter.
    await this.otpRepository.delete(record.id);
    this.logger.log(`verifyOtp: SUCCESS for ${phone}. OTP record deleted.`);

    return { success: true, message: 'OTP verified successfully.' };
  }

  /**
   * Remove OTP records older than 1 hour (the full rate-limit window).
   * Called automatically before each sendOtp.
   */
  private async cleanupOldRecords(): Promise<void> {
    const cutoff = new Date(Date.now() - this.rateLimitWindowMs);
    const result = await this.otpRepository.delete({ created_at: LessThan(cutoff) });
    if ((result.affected ?? 0) > 0) {
      this.logger.log(`cleanupOldRecords: removed ${result.affected} expired OTP record(s)`);
    }
  }

  /** Expose cleanup for scheduled task use (optional) */
  async runCleanup(): Promise<void> {
    await this.cleanupOldRecords();
  }
}
