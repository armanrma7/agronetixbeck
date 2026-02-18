import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { SmsModule } from './sms/sms.module';
import { RegionsModule } from './regions/regions.module';
import { CatalogModule } from './catalog/catalog.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { ApplicationsModule } from './applications/applications.module';
import { NotificationsModule } from './notifications/notifications.module';
import { FavoritesModule } from './favorites/favorites.module';
import { DeviceTokensModule } from './device-tokens/device-tokens.module';
import { User } from './entities/user.entity';
import { OtpCode } from './entities/otp-code.entity';
import { Region } from './entities/region.entity';
import { Village } from './entities/village.entity';
import { Announcement } from './entities/announcement.entity';
import { Application } from './entities/application.entity';
import { DeviceToken } from './entities/device-token.entity';
import { GoodsCategory } from './entities/goods-category.entity';
import { GoodsSubcategory } from './entities/goods-subcategory.entity';
import { GoodsItem } from './entities/goods-item.entity';
import { AnnouncementView } from './entities/announcement-view.entity';
import { AnnouncementFavorite } from './entities/announcement-favorite.entity';
import { Notification } from './entities/notification.entity';

@Module({
  imports: [
    // Configuration module
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', // make sure your .env file is in the project root
    }),
    // TypeORM configuration for Supabase Postgres
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST'),
          port: parseInt(configService.get<string>('DB_PORT') || '6543'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_DATABASE'),
          entities: [
            User,
            OtpCode,
            Region,
            Village,
            Announcement,
            Application,
            DeviceToken,
            GoodsCategory,
            GoodsSubcategory,
            GoodsItem,
            AnnouncementView,
            AnnouncementFavorite,
            Notification,
          ],
          synchronize: false, // Disabled: Use migrations instead (synchronize conflicts with triggers)
          ssl: {
            rejectUnauthorized: false, // Supabase requires SSL
          },
        };
      },
    }),
    // Feature modules
    SmsModule,
    RegionsModule,
    CatalogModule,
    NotificationsModule,
    DeviceTokensModule,
    AnnouncementsModule,
    ApplicationsModule,
    FavoritesModule,
    AuthModule,
    AdminModule,
  ],
})
export class AppModule {}
