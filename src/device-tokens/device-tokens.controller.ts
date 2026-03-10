import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { DeviceTokenService } from '../notifications/device-token.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserType } from '../entities/user.entity';

@ApiTags('device-tokens')
@Controller('device-tokens')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DeviceTokensController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register or update a device token for push notifications' })
  @ApiResponse({
    status: 201,
    description: 'Device token registered successfully',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async registerDevice(
    @Body() registerDto: RegisterDeviceDto,
    @Request() req,
  ) {
    return this.deviceTokenService.registerDevice(req.user.id, registerDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get device tokens',
    description:
      '- Non-admin: returns only current user devices.\n' +
      '- Admin: returns all devices, or filter by user_id.',
  })
  @ApiQuery({
    name: 'user_id',
    required: false,
    description: 'Admin only: filter by user UUID',
    type: String,
  })
  @ApiResponse({
    status: 200,
    description: 'List of user devices',
    type: [Object],
  })
  async getUserDevices(@Request() req, @Query('user_id') userId?: string) {
    // Admin can list all devices or filter by user_id
    if (req.user?.user_type === UserType.ADMIN) {
      return this.deviceTokenService.getDevicesForAdmin(userId);
    }

    // Non-admin always sees only their own devices (ignore user_id query)
    return this.deviceTokenService.getUserDevices(req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a device token by ID' })
  @ApiParam({
    name: 'id',
    description: 'Device token ID',
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'Device token removed successfully',
  })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async removeDevice(@Param('id') id: string, @Request() req) {
    await this.deviceTokenService.removeDevice(id, req.user.id);
  }

  @Delete('fcm/:fcmToken')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a device token by FCM token' })
  @ApiParam({
    name: 'fcmToken',
    description: 'FCM token',
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'Device token removed successfully',
  })
  @ApiResponse({ status: 404, description: 'Device not found' })
  async removeDeviceByFcmToken(
    @Param('fcmToken') fcmToken: string,
    @Request() req,
  ) {
    await this.deviceTokenService.removeDeviceByFcmToken(fcmToken, req.user.id);
  }
}
