import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FcmService } from './fcm.service';
import { DeviceTokenService } from './device-token.service';
import { DeviceToken } from '../entities/device-token.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([DeviceToken]),
  ],
  providers: [FcmService, DeviceTokenService],
  exports: [FcmService, DeviceTokenService],
})
export class NotificationsModule {}

