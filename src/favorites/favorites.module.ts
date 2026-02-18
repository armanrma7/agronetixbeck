import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { AnnouncementFavorite } from '../entities/announcement-favorite.entity';
import { Announcement } from '../entities/announcement.entity';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnnouncementFavorite,
      Announcement,
      Region,
      Village,
    ]),
    StorageModule,
  ],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
