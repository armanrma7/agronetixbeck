import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { CatalogService } from './catalog.service';
import { GoodsCategory } from '../entities/goods-category.entity';
import { GoodsSubcategory } from '../entities/goods-subcategory.entity';
import { GoodsItem } from '../entities/goods-item.entity';
import { CategoryType } from '../entities/goods-category.entity';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all categories, optionally filtered by type' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: CategoryType,
    description: 'Filter categories by type (goods, service, rent)',
  })
  @ApiResponse({
    status: 200,
    description: 'List of categories (filtered by type if provided)',
    type: [GoodsCategory],
  })
  async findAllCategories(@Query('type') type?: CategoryType): Promise<GoodsCategory[]> {
    return this.catalogService.findAllCategories(type);
  }

  @Get('categories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', description: 'Category UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Category details with subcategories',
    type: GoodsCategory,
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findCategoryById(@Param('id') id: string): Promise<GoodsCategory> {
    return this.catalogService.findCategoryById(id);
  }

  @Get('categories/:id/subcategories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all subcategories for a specific category' })
  @ApiParam({ name: 'id', description: 'Category UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'List of subcategories in the category',
    type: [GoodsSubcategory],
  })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findSubcategoriesByCategory(
    @Param('id') categoryId: string,
  ): Promise<GoodsSubcategory[]> {
    return this.catalogService.findSubcategoriesByCategory(categoryId);
  }

  @Get('subcategories')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all subcategories' })
  @ApiResponse({
    status: 200,
    description: 'List of all subcategories with category information',
    type: [GoodsSubcategory],
  })
  async findAllSubcategories(): Promise<GoodsSubcategory[]> {
    return this.catalogService.findAllSubcategories();
  }

  @Get('subcategories/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get subcategory by ID' })
  @ApiParam({ name: 'id', description: 'Subcategory UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Subcategory details with category and items',
    type: GoodsSubcategory,
  })
  @ApiResponse({ status: 404, description: 'Subcategory not found' })
  async findSubcategoryById(@Param('id') id: string): Promise<GoodsSubcategory> {
    return this.catalogService.findSubcategoryById(id);
  }

  @Get('subcategories/:id/items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all items for a specific subcategory' })
  @ApiParam({ name: 'id', description: 'Subcategory UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'List of items in the subcategory',
    type: [GoodsItem],
  })
  @ApiResponse({ status: 404, description: 'Subcategory not found' })
  async findItemsBySubcategory(
    @Param('id') subcategoryId: string,
  ): Promise<GoodsItem[]> {
    return this.catalogService.findItemsBySubcategory(subcategoryId);
  }

  @Get('items')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all items' })
  @ApiResponse({
    status: 200,
    description: 'List of all items with subcategory information',
    type: [GoodsItem],
  })
  async findAllItems(): Promise<GoodsItem[]> {
    return this.catalogService.findAllItems();
  }

  @Get('items/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id', description: 'Item UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Item details with subcategory information',
    type: GoodsItem,
  })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async findItemById(@Param('id') id: string): Promise<GoodsItem> {
    return this.catalogService.findItemById(id);
  }
}

