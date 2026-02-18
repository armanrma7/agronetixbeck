import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
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
} from '@nestjs/swagger';
import { DeviceTokenService } from '../notifications/device-token.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
  @ApiOperation({ summary: 'Get all devices for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of user devices',
    type: [Object],
  })
  async getUserDevices(@Request() req) {
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
