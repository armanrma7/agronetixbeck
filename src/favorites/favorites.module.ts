import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';
import { AnnouncementFavorite } from '../entities/announcement-favorite.entity';
import { AnnouncementsModule } from '../announcements/announcements.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AnnouncementFavorite]),
    AnnouncementsModule,
  ],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
