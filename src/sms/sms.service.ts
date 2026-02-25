import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

export interface SmsResult {
  success: boolean;
  message?: string;
  error?: string;
  sid?: string; // Twilio message SID
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private client: Twilio | null = null;
  private readonly fromPhone: string;
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.fromPhone = this.configService.get<string>('TWILIO_FROM_PHONE') || '';

    if (!accountSid || !authToken || !this.fromPhone) {
      this.logger.warn(
        'Twilio is not fully configured. ' +
        'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_PHONE in your .env file.',
      );
      this.isConfigured = false;
    } else {
      this.client = new Twilio(accountSid, authToken);
      this.isConfigured = true;
      this.logger.log(`TwilioService ready — from: ${this.fromPhone}`);
    }
  }

  /**
   * Send an OTP code to a phone number via Twilio SMS.
   * Phone must be in E.164 format, e.g. +37494000000
   */
  async sendOtp(phone: string, otp: string): Promise<SmsResult> {
    const body = `Your verification code is: ${otp}. It expires in 5 minutes. Do not share it with anyone.`;

    if (!this.isConfigured) {
      // In dev mode without credentials, just log so testing is still possible
      if (this.configService.get('NODE_ENV') !== 'production') {
        this.logger.warn(`[DEV] Twilio not configured. OTP for ${phone}: ${otp}`);
        return { success: true, message: 'Dev mode — SMS not sent, OTP logged above' };
      }
      return { success: false, error: 'Twilio is not configured on this server.' };
    }

    try {
      this.logger.log(`Sending OTP SMS to ${phone}...`);
      const msg = await this.client!.messages.create({
        body,
        from: this.fromPhone,
        to: phone,
      });
      this.logger.log(`OTP SMS sent to ${phone}, SID=${msg.sid}, status=${msg.status}`);
      return { success: true, message: 'OTP sent successfully', sid: msg.sid };
    } catch (err: any) {
      this.logger.error(`Twilio failed to send SMS to ${phone}: [${err.code}] ${err.message}`);
      return { success: false, error: `Twilio error ${err.code}: ${err.message}` };
    }
  }
}
