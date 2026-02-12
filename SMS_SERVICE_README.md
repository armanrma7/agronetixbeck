# MSG91 SMS Service - Implementation Guide

## Overview

A production-ready NestJS SMS service using MSG91 HTTP API to send OTP SMS **without templates**.

## Files Created

1. **`src/sms/sms.service.ts`** - Main SMS service with MSG91 integration
2. **`src/sms/sms.module.ts`** - NestJS module (marked as `@Global()` for easy injection)
3. **`src/sms/USAGE_EXAMPLE.md`** - Usage examples
4. **`src/auth/auth.service.example.ts`** - Example integration in AuthService

## Features

✅ **MSG91 HTTP API Integration**
- Uses `https://api.msg91.com/api/sendhttp.php`
- Route 4 (Transactional OTP)
- Auto-detects country code from phone number
- No template required - sends message directly

✅ **NestJS Integration**
- Injectable service
- Global module (available to all modules)
- Proper error handling and logging

✅ **Configuration**
- Reads from `.env`:
  - `MSG91_AUTH_KEY` (required)
  - `MSG91_SENDER_ID` (optional, default: "ACRONET")

✅ **Error Handling**
- Validates configuration
- Handles API errors
- Returns structured result object
- Comprehensive logging

## Environment Variables

Add to your `.env` file:

```env
MSG91_AUTH_KEY=your-msg91-auth-key-here
MSG91_SENDER_ID=ACRONET
```

## Usage

### Method Signature

```typescript
async sendOtp(
  phone: string,
  otp: string,
  message?: string
): Promise<SmsResult>
```

### Basic Usage

```typescript
import { SmsService } from './sms/sms.service';

constructor(private smsService: SmsService) {}

async sendOtp() {
  const result = await this.smsService.sendOtp(
    '+919876543210',
    '123456'
  );

  if (result.success) {
    console.log('OTP sent:', result.responseId);
  } else {
    console.error('Error:', result.error);
  }
}
```

### Custom Message

```typescript
const result = await this.smsService.sendOtp(
  '+919876543210',
  '123456',
  'Your verification code is 123456. Valid for 5 minutes.'
);
```

### Return Type

```typescript
interface SmsResult {
  success: boolean;
  message?: string;
  error?: string;
  responseId?: string;
}
```

## Integration

### Already Integrated

The `SmsService` is already integrated with:
- ✅ `SmsProviderService` (uses SmsService internally)
- ✅ `OtpService` (uses SmsProviderService)
- ✅ `AuthService` (uses OtpService)

So OTP sending will automatically use MSG91 when configured!

### Direct Usage

You can also inject `SmsService` directly in any module:

```typescript
import { SmsService } from '../sms/sms.service';

@Injectable()
export class YourService {
  constructor(private smsService: SmsService) {}

  async sendSms() {
    await this.smsService.sendOtp('+919876543210', '123456');
  }
}
```

## MSG91 API Details

### Endpoint
```
GET https://api.msg91.com/api/sendhttp.php
```

### Parameters
- `authkey`: Your MSG91 authentication key
- `mobiles`: Phone number (without +)
- `message`: SMS message text
- `sender`: Sender ID (6 characters)
- `route`: 4 (Transactional OTP)
- `country`: Auto-detected from phone number

### Response
- **Success**: Returns request ID (numeric string)
- **Error**: Returns error message

## Phone Number Format

Phone numbers must be in **E.164 format**:
- ✅ `+919876543210` (India)
- ✅ `+1234567890` (USA)
- ❌ `919876543210` (missing +)
- ❌ `9876543210` (missing country code)

## Development Mode

In development (when `MSG91_AUTH_KEY` is not set):
- Logs OTP to console instead of sending
- Returns success to allow testing
- Warns about missing configuration

## Production

In production:
- Requires `MSG91_AUTH_KEY` to be set
- Returns error if not configured
- All errors are logged

## Testing

1. Set `MSG91_AUTH_KEY` in `.env`
2. Call `sendOtp()` with a valid phone number
3. Check logs for MSG91 response
4. Verify SMS is received

## Error Handling

The service handles:
- Missing configuration
- Invalid phone number format
- MSG91 API errors
- Network errors
- All errors are logged with context

## Logging

The service uses NestJS Logger:
- `debug`: API calls
- `log`: Success messages
- `warn`: Configuration issues
- `error`: Failures

## Next Steps

1. Get MSG91 account and auth key
2. Add `MSG91_AUTH_KEY` to `.env`
3. Test with a real phone number
4. Monitor logs for any issues

