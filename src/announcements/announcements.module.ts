import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AnnouncementsController } from './announcements.controller';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementExpiryTask } from './tasks/announcement-expiry.task';
import { Announcement } from '../entities/announcement.entity';
import { Application } from '../entities/application.entity';
import { User } from '../entities/user.entity';
import { GoodsCategory } from '../entities/goods-category.entity';
import { GoodsItem } from '../entities/goods-item.entity';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';
import { AnnouncementView } from '../entities/announcement-view.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Announcement, 
      Application, 
      User, 
      GoodsCategory, 
      GoodsItem,
      Region,
      Village,
      AnnouncementView,
    ]),
    NotificationsModule,
    StorageModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AnnouncementExpiryTask],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}

