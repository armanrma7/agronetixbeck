import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { GoodsCategory } from '../entities/goods-category.entity';
import { GoodsSubcategory } from '../entities/goods-subcategory.entity';
import { GoodsItem } from '../entities/goods-item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([GoodsCategory, GoodsSubcategory, GoodsItem]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}

