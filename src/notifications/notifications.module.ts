import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FcmService } from './fcm.service';
import { DeviceTokenService } from './device-token.service';
import { NotificationService } from './notification.service';
import { NotificationsController } from './notifications.controller';
import { DeviceToken } from '../entities/device-token.entity';
import { Notification } from '../entities/notification.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([DeviceToken, Notification]),
  ],
  providers: [FcmService, DeviceTokenService, NotificationService],
  controllers: [NotificationsController],
  exports: [FcmService, DeviceTokenService, NotificationService],
})
export class NotificationsModule {}

