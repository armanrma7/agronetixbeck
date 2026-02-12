import {
  Controller,
  Post,
  Put,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserOwnerOrAdminGuard } from './guards/user-owner-or-admin.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ 
    summary: 'Register a new user or update existing unverified user',
    description: 'If user exists and is verified: returns 409 Conflict. If user exists but not verified: updates credentials, automatically sends OTP, and returns "User updated. Please verify OTP". If user does not exist: creates new user and automatically sends OTP.'
  })
  @ApiResponse({
    status: 201,
    description: 'User registered/updated successfully. Returns OTP code and user with verified: false',
    schema: {
      oneOf: [
        {
          example: {
            message: 'Registration success',
            user: {
              id: 'uuid',
              full_name: 'John Doe',
              phone: '+1234567890',
              user_type: 'farmer',
              verified: false,
            },
            otp_code: '123456',
          },
        },
        {
          example: {
            message: 'User updated. Please verify OTP',
            user: {
              id: 'uuid',
              full_name: 'John Doe',
              phone: '+1234567890',
              user_type: 'farmer',
              verified: false,
            },
            otp_code: '123456',
          },
        },
        {
          example: {
            message: 'User updated. Please verify OTP',
            user: {
              id: 'uuid',
              full_name: 'Company Name',
              phone: '+1234567890',
              user_type: 'company',
              verified: false,
              account_status: 'pending',
            },
            otp_code: '123456',
          },
        },
        {
          example: {
            message: 'Awaiting verification',
            user: {
              id: 'uuid',
              full_name: 'Company Name',
              phone: '+1234567890',
              user_type: 'company',
              verified: false,
              account_status: 'pending',
            },
            otp_code: '123456',
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request (e.g., terms not accepted)' })
  @ApiResponse({ 
    status: 409, 
    description: 'Conflict (user already exists or duplicate company name)',
    schema: {
      example: {
        statusCode: 409,
        message: 'User already exists',
        error: 'Conflict',
      },
    },
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to phone number' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      oneOf: [
        {
          example: {
            success: true,
            message: 'OTP sent successfully',
            otp_code: '123456',
          },
        },
        {
          example: {
            success: false,
            message: 'OTP generated but failed to send via SMS',
            otp_code: '123456',
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.authService.sendOtp(
      sendOtpDto.phone,
      sendOtpDto.channel,
      sendOtpDto.purpose,
    );
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Verify OTP code',
    description: 'Verifies OTP, marks Farmer accounts as verified, and returns access token and refresh token (same as login). Company accounts still require admin verification.'
  })
  @ApiResponse({
    status: 200,
    description: 'OTP verified successfully. Returns tokens and user data.',
    schema: {
      oneOf: [
        {
          example: {
            message: 'OTP verified successfully. Account is now verified.',
            user: {
              id: 'uuid',
              full_name: 'John Doe',
              phone: '+1234567890',
              user_type: 'farmer',
              verified: true,
              region: { id: 'uuid', name_en: 'Aragatsotn' },
              village: { id: 'uuid', name_en: 'Agarak' },
            },
            access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expires_in: 900,
          },
        },
        {
          example: {
            message: 'OTP verified successfully. Awaiting admin verification.',
            user: {
              id: 'uuid',
              full_name: 'Company Name',
              phone: '+1234567890',
              user_type: 'company',
              verified: false,
              account_status: 'pending',
              region: { id: 'uuid', name_en: 'Aragatsotn' },
              village: { id: 'uuid', name_en: 'Agarak' },
            },
            access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            expires_in: 900,
          },
        },
      ],
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request (invalid OTP, expired, etc.)' })
  @ApiResponse({ status: 401, description: 'Unauthorized (account locked or blocked)' })
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(
      verifyOtpDto.phone,
      verifyOtpDto.code,
      verifyOtpDto.purpose,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Login with phone and password',
    description: 'Optionally include FCM token and device info for push notifications'
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      example: {
        message: 'Login successful',
        user: {
          id: 'uuid',
          full_name: 'John Doe',
          phone: '+1234567890',
          user_type: 'farmer',
          verified: true,
        },
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expires_in: 900,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized (invalid credentials, unverified account, or locked account)' })
  async login(@Body() loginDto: LoginDto) {
    console.info(loginDto);
    return this.authService.login(loginDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate forgot password flow' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent or admin review required',
    schema: {
      example: {
        message: 'OTP sent for password reset',
        requiresAdminReview: false,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.phone);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with OTP verification' })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      example: {
        message: 'Password reset successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request (invalid OTP, locked account, etc.)' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'New access token generated successfully',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expires_in: 900,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized (invalid or expired refresh token)' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto.refresh_token);
  }

  @Put('users/:id')
  @UseGuards(JwtAuthGuard, UserOwnerOrAdminGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Update user profile',
    description: 'Update user profile. Users can only update themselves. Admins can update any user.'
  })
  @ApiParam({ name: 'id', description: 'User UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    schema: {
      example: {
        message: 'User updated successfully',
        user: {
          id: 'uuid',
          full_name: 'John Doe',
          phone: '+1234567890',
          user_type: 'farmer',
          verified: true,
          phones: ['+1234567891'],
          emails: ['john@example.com'],
          profile_picture: 'https://example.com/profile.jpg',
          region: { id: 'uuid', name_en: 'Aragatsotn' },
          village: { id: 'uuid', name_en: 'Agarak' },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request (invalid region/village ID, etc.)' })
  @ApiResponse({ status: 401, description: 'Unauthorized (not authenticated)' })
  @ApiResponse({ status: 403, description: 'Forbidden (not owner or admin)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.authService.updateUser(id, updateUserDto);
  }
}

