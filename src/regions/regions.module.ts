import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RegionsController, VillagesController } from './regions.controller';
import { RegionsService } from './regions.service';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Region, Village])],
  controllers: [RegionsController, VillagesController],
  providers: [RegionsService],
  exports: [RegionsService],
})
export class RegionsModule {}

