import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UnlockUserDto } from './dto/unlock-user.dto';
import { VerifyCompanyDto } from './dto/verify-company.dto';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('unlock-user')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlock or lock a user account (admin escalation)' })
  @ApiResponse({
    status: 200,
    description: 'User unlocked/locked successfully',
    schema: {
      example: {
        message: 'User unlocked successfully',
        user: {
          id: 'uuid',
          phone: '+1234567890',
          is_locked: false,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async unlockUser(@Body() unlockUserDto: UnlockUserDto) {
    return this.adminService.unlockUser(unlockUserDto);
  }

  @Post('verify-company')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify or reject a company account (admin review)' })
  @ApiResponse({
    status: 200,
    description: 'Company verified/rejected successfully',
    schema: {
      example: {
        message: 'Company verified successfully',
        user: {
          id: 'uuid',
          phone: '+1234567890',
          full_name: 'Company Name',
          verified: true,
          account_status: 'active',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request (user is not a company)' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async verifyCompany(@Body() verifyCompanyDto: VerifyCompanyDto) {
    return this.adminService.verifyCompany(verifyCompanyDto);
  }

  @Get('users-requiring-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all users requiring admin review' })
  @ApiResponse({
    status: 200,
    description: 'List of users requiring review',
    schema: {
      example: {
        users: [
          {
            id: 'uuid',
            phone: '+1234567890',
            full_name: 'Company Name',
            user_type: 'company',
            verified: false,
            account_status: 'pending',
            is_locked: false,
          },
        ],
      },
    },
  })
  async getUsersRequiringReview() {
    return this.adminService.getUsersRequiringReview();
  }
}

