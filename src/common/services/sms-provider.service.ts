import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel } from '../../entities/otp-code.entity';
import { SmsService } from '../../sms/sms.service';

/**
 * Abstracted SMS Provider Service
 * Supports multiple providers (MSG91, Twilio, etc.)
 * Currently implements MSG91, but can be extended
 */
@Injectable()
export class SmsProviderService {
  private readonly provider: string;

  constructor(
    private configService: ConfigService,
    private smsService: SmsService,
  ) {
    this.provider = this.configService.get('SMS_PROVIDER') || 'msg91';
  }

  /**
   * Send OTP via SMS provider
   * Abstracted to support multiple providers
   */
  async sendOtp(phone: string, otp: string, channel: OtpChannel): Promise<void> {
    // Currently only SMS channel is implemented
    // Viber, WhatsApp, Telegram can be added later
    if (channel === OtpChannel.SMS) {
      await this.sendSms(phone, otp);
    } else {
      // For other channels, fallback to SMS for now
      console.warn(`Channel ${channel} not yet implemented, using SMS`);
      await this.sendSms(phone, otp);
    }
  }

  /**
   * Send SMS via configured provider
   */
  private async sendSms(phone: string, otp: string): Promise<void> {
    switch (this.provider.toLowerCase()) {
      case 'msg91':
        await this.sendViaMsg91(phone, otp);
        break;
      case 'twilio':
        // await this.sendViaTwilio(phone, otp);
        throw new Error('Twilio provider not yet implemented');
      default:
        // In development, just log the OTP
        console.log(`[DEV MODE] OTP for ${phone}: ${otp}`);
        // In production, you should throw an error or use a default provider
        if (this.configService.get('NODE_ENV') === 'production') {
          throw new Error(`SMS provider ${this.provider} not configured`);
        }
    }
  }

  /**
   * Send OTP via MSG91 API using SmsService
   */
  private async sendViaMsg91(phone: string, otp: string): Promise<void> {
    const result = await this.smsService.sendOtp(phone, otp);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to send SMS via MSG91');
    }
  }

  /**
   * Send OTP via Twilio (placeholder for future implementation)
   */
  private async sendViaTwilio(phone: string, otp: string): Promise<void> {
    // Implement Twilio integration here
    throw new Error('Twilio provider not yet implemented');
  }
}

