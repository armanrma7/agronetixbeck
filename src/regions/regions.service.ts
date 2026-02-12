import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';

@Injectable()
export class RegionsService {
  constructor(
    @InjectRepository(Region)
    private regionRepository: Repository<Region>,
    @InjectRepository(Village)
    private villageRepository: Repository<Village>,
  ) {}

  /**
   * Get all regions
   */
  async findAll(): Promise<Region[]> {
    return this.regionRepository.find({
      order: { name_en: 'ASC' },
    });
  }

  /**
   * Get region by ID
   */
  async findOne(id: string): Promise<Region> {
    const region = await this.regionRepository.findOne({
      where: { id },
      relations: ['villages'],
    });

    if (!region) {
      throw new NotFoundException(`Region with ID ${id} not found`);
    }

    return region;
  }

  /**
   * Get all villages for a specific region
   */
  async findVillagesByRegion(regionId: string): Promise<Village[]> {
    // Verify region exists
    const region = await this.regionRepository.findOne({
      where: { id: regionId },
    });

    if (!region) {
      throw new NotFoundException(`Region with ID ${regionId} not found`);
    }

    return this.villageRepository.find({
      where: { region_id: regionId },
      order: { name_en: 'ASC' },
    });
  }

  /**
   * Get village by ID
   */
  async findVillageById(id: string): Promise<Village> {
    const village = await this.villageRepository.findOne({
      where: { id },
      relations: ['region'],
    });

    if (!village) {
      throw new NotFoundException(`Village with ID ${id} not found`);
    }

    return village;
  }

  /**
   * Get all villages
   */
  async findAllVillages(): Promise<Village[]> {
    return this.villageRepository.find({
      relations: ['region'],
      order: { name_en: 'ASC' },
    });
  }
}

