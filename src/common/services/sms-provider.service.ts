/**
 * SmsProviderService is now a thin pass-through to SmsService (Twilio).
 * It is kept for backward compatibility in case other services depend on it.
 * All SMS sending goes through Twilio — MSG91 has been removed.
 */
import { Injectable } from '@nestjs/common';
import { SmsService } from '../../sms/sms.service';

@Injectable()
export class SmsProviderService {
  constructor(private smsService: SmsService) {}

  async sendOtp(phone: string, otp: string): Promise<void> {
    const result = await this.smsService.sendOtp(phone, otp);
    if (!result.success) {
      throw new Error(result.error || 'Failed to send OTP via Twilio');
    }
  }
}
