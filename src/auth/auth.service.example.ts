/**
 * EXAMPLE: How to use SmsService (Twilio) directly in AuthService.
 * The actual OTP flow is handled by OtpService — this is for reference only.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SmsService } from '../sms/sms.service';
import { User } from '../entities/user.entity';

@Injectable()
export class AuthServiceExample {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private smsService: SmsService,
  ) {}

  /**
   * Example: Send OTP after user registration via Twilio
   */
  async registerAndSendOtp(phone: string, otp: string) {
    const smsResult = await this.smsService.sendOtp(phone, otp);

    if (smsResult.success) {
      console.log(`OTP sent to ${phone}. SID: ${smsResult.sid}`);
    } else {
      console.error(`Failed to send OTP to ${phone}: ${smsResult.error}`);
      throw new Error(`Failed to send OTP: ${smsResult.error}`);
    }

    return { success: true, message: 'User registered and OTP sent' };
  }
}
