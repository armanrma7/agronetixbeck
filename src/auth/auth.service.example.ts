/**
 * EXAMPLE: How to use SmsService directly in AuthService
 * 
 * This file shows how to integrate SmsService for sending OTP after user registration.
 * The actual implementation is already integrated via SmsProviderService,
 * but this shows direct usage if needed.
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
    private smsService: SmsService, // Inject SmsService
  ) {}

  /**
   * Example: Send OTP after user registration
   */
  async registerAndSendOtp(phone: string, otp: string) {
    // ... create user logic ...

    // Send OTP using SmsService
    const smsResult = await this.smsService.sendOtp(phone, otp);

    if (smsResult.success) {
      console.log(`OTP sent successfully to ${phone}. Response ID: ${smsResult.responseId}`);
      // Continue with registration flow
    } else {
      console.error(`Failed to send OTP to ${phone}: ${smsResult.error}`);
      // Handle error - maybe retry or notify user
      throw new Error(`Failed to send OTP: ${smsResult.error}`);
    }

    return { success: true, message: 'User registered and OTP sent' };
  }

  /**
   * Example: Send OTP with custom message
   */
  async sendCustomOtp(phone: string, otp: string) {
    const customMessage = `Welcome! Your verification code is ${otp}. This code expires in 5 minutes.`;
    
    const result = await this.smsService.sendOtp(phone, otp, customMessage);
    
    return result;
  }

  /**
   * Example: Check if SMS service is configured before sending
   */
  async sendOtpSafely(phone: string, otp: string) {
    if (!this.smsService.isConfigured()) {
      console.warn('SMS service not configured. Skipping OTP send.');
      // In development, you might want to log the OTP
      if (process.env.NODE_ENV === 'development') {
        console.log(`[DEV] OTP for ${phone}: ${otp}`);
      }
      return { success: false, error: 'SMS service not configured' };
    }

    return await this.smsService.sendOtp(phone, otp);
  }
}

