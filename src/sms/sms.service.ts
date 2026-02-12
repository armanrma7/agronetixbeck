import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface SmsResult {
  success: boolean;
  message?: string;
  error?: string;
  responseId?: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly msg91AuthKey: string;
  private readonly msg91SenderId: string;
  private readonly msg91ApiUrl = 'https://api.msg91.com/api/sendhttp.php';

  constructor(private configService: ConfigService) {
    this.msg91AuthKey = this.configService.get<string>('MSG91_AUTH_KEY') || '';
    this.msg91SenderId = this.configService.get<string>('MSG91_SENDER_ID') || 'ACRONET';

    if (!this.msg91AuthKey) {
      this.logger.warn('MSG91_AUTH_KEY not configured. SMS sending will fail in production.');
    }
  }

  /**
   * Extract country code from phone number
   * Assumes phone number is in E.164 format (e.g., +919876543210)
   */
  private extractCountryCode(phone: string): string {
    // Remove + sign
    const cleanPhone = phone.replace(/^\+/, '');
    
    // Common country codes mapping (can be extended)
    // India: 91, USA: 1, etc.
    // For MSG91, we'll try to detect common patterns
    // if (cleanPhone.startsWith('91')) {
    //   return '91'; // India
    // } else if (cleanPhone.startsWith('1')) {
    //   return '1'; // USA/Canada
    // } else if (cleanPhone.startsWith('44')) {
    //   return '44'; // UK
    // } else if (cleanPhone.startsWith('61')) {
    //   return '61'; // Australia
    // }
    
    // Default: try first 2 digits as country code
    // MSG91 will handle validation
    return cleanPhone.substring(0, 2);
  }

  /**
   * Send OTP SMS via MSG91 HTTP API
   * 
   * @param phone - Phone number in E.164 format (e.g., +919876543210)
   * @param otp - OTP code to send
   * @param message - Optional custom message (default: "Your OTP code is ${otp}. Valid for 5 minutes.")
   * @returns Promise<SmsResult> - Success/failure result
   */
  async sendOtp(
    phone: string,
    otp: string,
    message?: string,
  ): Promise<SmsResult> {
    // Validate configuration
    if (!this.msg91AuthKey) {
      const errorMsg = 'MSG91_AUTH_KEY not configured';
      this.logger.error(errorMsg);
      
      // In development, log and return success to allow testing
      if (this.configService.get('NODE_ENV') !== 'production') {
        this.logger.warn(`[DEV MODE] Would send OTP to ${phone}: ${otp}`);
        return {
          success: true,
          message: 'SMS not sent (dev mode)',
        };
      }
      
      return {
        success: false,
        error: errorMsg,
      };
    }

    // Validate phone number
    if (!phone || !phone.startsWith('+')) {
      const errorMsg = 'Invalid phone number format. Must be in E.164 format (e.g., +919876543210)';
      this.logger.error(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }

    // Prepare message
    const smsMessage = message || `Your OTP code is ${otp}. Valid for 5 minutes.`;

    // Extract country code
    const countryCode = this.extractCountryCode(phone);

    // Remove + sign and country code for mobile number
    const mobileNumber = phone.replace(/^\+/, '').replace(/^[0-9]{1,3}/, '');

    // Build query parameters for MSG91 HTTP API
    const params = new URLSearchParams({
      authkey: this.msg91AuthKey,
      mobiles: phone.replace(/^\+/, ''), // Full number without +
      message: smsMessage,
      sender: this.msg91SenderId,
      route: '4', // Transactional OTP route
      country: countryCode,
    });

    const apiUrl = `${this.msg91ApiUrl}?${params.toString()}`;

    try {
      this.logger.debug(`Sending OTP to ${phone} via MSG91`);
      
      const response = await fetch(apiUrl, {
        method: 'GET', // MSG91 HTTP API uses GET
        headers: {
          'Accept': 'application/json',
        },
      });

      const responseText = await response.text();
      
      // MSG91 returns different response formats
      // Success: Usually returns a request ID or "success"
      // Error: Returns error message or error code
      
      this.logger.log(`MSG91 Response for ${phone}: ${responseText}`);

      // Check if response indicates success
      // MSG91 typically returns a request ID (numeric string) on success
      // or error message on failure
      const isSuccess = /^\d+$/.test(responseText.trim()) || 
                       responseText.toLowerCase().includes('success') ||
                       responseText.toLowerCase().includes('submitted');

      if (!isSuccess) {
        const errorMsg = `MSG91 API error: ${responseText}`;
        this.logger.error(errorMsg);
        return {
          success: false,
          error: errorMsg,
          message: responseText,
        };
      }

      this.logger.log(`OTP sent successfully to ${phone}`);
      
      return {
        success: true,
        message: 'OTP sent successfully',
        responseId: responseText.trim(),
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send OTP to ${phone}: ${errorMsg}`, error);
      
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Validate MSG91 configuration
   */
  isConfigured(): boolean {
    return !!this.msg91AuthKey && !!this.msg91SenderId;
  }
}

