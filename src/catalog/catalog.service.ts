import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoodsCategory, CategoryType } from '../entities/goods-category.entity';
import { GoodsSubcategory } from '../entities/goods-subcategory.entity';
import { GoodsItem } from '../entities/goods-item.entity';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(GoodsCategory)
    private categoryRepository: Repository<GoodsCategory>,
    @InjectRepository(GoodsSubcategory)
    private subcategoryRepository: Repository<GoodsSubcategory>,
    @InjectRepository(GoodsItem)
    private itemRepository: Repository<GoodsItem>,
  ) {}

  /**
   * Get all categories, optionally filtered by type
   */
  async findAllCategories(type?: CategoryType): Promise<GoodsCategory[]> {
    if (type) {
      // Validate type enum
      if (!Object.values(CategoryType).includes(type)) {
        throw new BadRequestException(
          `Invalid category type. Must be one of: ${Object.values(CategoryType).join(', ')}`,
        );
      }
      
      return this.categoryRepository.find({
        where: { type },
        order: { name_en: 'ASC' },
      });
    }
    
    return this.categoryRepository.find({
      order: { name_en: 'ASC' },
    });
  }

  /**
   * Get category by ID
   */
  async findCategoryById(id: string): Promise<GoodsCategory> {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['subcategories'],
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    return category;
  }

  /**
   * Get all subcategories
   */
  async findAllSubcategories(): Promise<GoodsSubcategory[]> {
    return this.subcategoryRepository.find({
      relations: ['category'],
      order: { name_en: 'ASC' },
    });
  }

  /**
   * Get subcategory by ID
   */
  async findSubcategoryById(id: string): Promise<GoodsSubcategory> {
    const subcategory = await this.subcategoryRepository.findOne({
      where: { id },
      relations: ['category', 'items'],
    });

    if (!subcategory) {
      throw new NotFoundException(`Subcategory with ID ${id} not found`);
    }

    return subcategory;
  }

  /**
   * Get all subcategories for a specific category
   */
  async findSubcategoriesByCategory(categoryId: string): Promise<GoodsSubcategory[]> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException(`Category with ID ${categoryId} not found`);
    }

    return this.subcategoryRepository.find({
      where: { category_id: categoryId },
      relations: ['category', 'items'],
      order: { name_en: 'ASC' },
    });
  }

  /**
   * Get all items
   */
  async findAllItems(): Promise<GoodsItem[]> {
    return this.itemRepository.find({
      relations: ['subcategory'],
      order: { name_en: 'ASC' },
    });
  }

  /**
   * Get item by ID
   */
  async findItemById(id: string): Promise<GoodsItem> {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['subcategory'],
    });

    if (!item) {
      throw new NotFoundException(`Item with ID ${id} not found`);
    }

    return item;
  }

  /**
   * Get all items for a specific subcategory
   */
  async findItemsBySubcategory(subcategoryId: string): Promise<GoodsItem[]> {
    const subcategory = await this.subcategoryRepository.findOne({
      where: { id: subcategoryId },
    });

    if (!subcategory) {
      throw new NotFoundException(`Subcategory with ID ${subcategoryId} not found`);
    }

    return this.itemRepository.find({
      where: { subcategory_id: subcategoryId },
      relations: ['subcategory'],
      order: { name_en: 'ASC' },
    });
  }
}

