import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { UnlockUserDto } from './dto/unlock-user.dto';
import { VerifyCompanyDto } from './dto/verify-company.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { IsAdminGuard } from '../announcements/guards/is-admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, IsAdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Admin: get users',
    description:
      'Supports filters: name (full_name), phone, user_type, account_status, is_locked, plus pagination.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default 20, max 100)' })
  @ApiQuery({ name: 'name', required: false, type: String, description: 'Search by full_name (contains, case-insensitive)' })
  @ApiQuery({ name: 'phone', required: false, type: String, description: 'Search by phone (contains)' })
  @ApiQuery({ name: 'user_type', required: false, enum: ['farmer', 'company', 'admin'] })
  @ApiQuery({ name: 'account_status', required: false, enum: ['pending', 'active', 'blocked'] })
  @ApiQuery({ name: 'is_locked', required: false, type: Boolean })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of users matching filters',
    type: Object,
  })
  async getAllUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('name') name?: string,
    @Query('phone') phone?: string,
    @Query('user_type') user_type?: string,
    @Query('account_status') account_status?: string,
    @Query('is_locked') is_locked?: string,
  ) {
    const isLockedBool =
      is_locked === undefined
        ? undefined
        : is_locked === 'true'
        ? true
        : is_locked === 'false'
        ? false
        : undefined;

    return this.adminService.getAllUsers({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      name,
      phone,
      user_type: user_type as any,
      account_status: account_status as any,
      is_locked: isLockedBool,
    });
  }

  @Patch('users/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: update user (type, status, lock, verified)' })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: Object,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.adminService.updateUserAsAdmin(id, dto);
  }

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

