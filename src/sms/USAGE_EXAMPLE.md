# SMS Service Usage Example

## Environment Variables

Add these to your `.env` file:

```env
MSG91_AUTH_KEY=your-msg91-auth-key-here
MSG91_SENDER_ID=ACRONET
```

## Direct Usage in AuthService

Here's how to use `SmsService` directly in your `AuthService`:

```typescript
import { Injectable } from '@nestjs/common';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class AuthService {
  constructor(
    private smsService: SmsService,
    // ... other dependencies
  ) {}

  async sendOtpToUser(phone: string, otp: string) {
    // Send OTP with default message
    const result = await this.smsService.sendOtp(phone, otp);
    
    if (result.success) {
      console.log('OTP sent successfully:', result.responseId);
    } else {
      console.error('Failed to send OTP:', result.error);
    }

    // Or with custom message
    const customResult = await this.smsService.sendOtp(
      phone,
      otp,
      `Your verification code is ${otp}. Use it within 5 minutes.`
    );
  }
}
```

## Integration with Existing OTP Service

The `SmsService` is already integrated with the existing `SmsProviderService`, which is used by `OtpService`. So OTP sending will automatically use MSG91 when configured.

## API Details

### Method Signature
```typescript
async sendOtp(
  phone: string,
  otp: string,
  message?: string
): Promise<SmsResult>
```

### Parameters
- `phone`: Phone number in E.164 format (e.g., `+919876543210`)
- `otp`: OTP code to send
- `message`: Optional custom message (default: "Your OTP code is ${otp}. Valid for 5 minutes.")

### Return Value
```typescript
interface SmsResult {
  success: boolean;
  message?: string;
  error?: string;
  responseId?: string;
}
```

### MSG91 API Configuration
- **Endpoint**: `https://api.msg91.com/api/sendhttp.php`
- **Method**: GET
- **Route**: 4 (Transactional OTP)
- **Country Code**: Auto-detected from phone number

