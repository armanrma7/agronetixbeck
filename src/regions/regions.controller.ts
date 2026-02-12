import {
  Controller,
  Get,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RegionsService } from './regions.service';
import { Region } from '../entities/region.entity';
import { Village } from '../entities/village.entity';

@ApiTags('regions')
@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all regions' })
  @ApiResponse({
    status: 200,
    description: 'List of all regions',
    type: [Region],
  })
  async findAll(): Promise<Region[]> {
    return this.regionsService.findAll();
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get region by ID' })
  @ApiParam({ name: 'id', description: 'Region UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Region details with villages',
    type: Region,
  })
  @ApiResponse({ status: 404, description: 'Region not found' })
  async findOne(@Param('id') id: string): Promise<Region> {
    return this.regionsService.findOne(id);
  }

  @Get(':id/villages')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all villages for a specific region' })
  @ApiParam({ name: 'id', description: 'Region UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'List of villages in the region',
    type: [Village],
  })
  @ApiResponse({ status: 404, description: 'Region not found' })
  async findVillagesByRegion(@Param('id') regionId: string): Promise<Village[]> {
    return this.regionsService.findVillagesByRegion(regionId);
  }
}

@ApiTags('villages')
@Controller('villages')
export class VillagesController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all villages' })
  @ApiResponse({
    status: 200,
    description: 'List of all villages with region information',
    type: [Village],
  })
  async findAll(): Promise<Village[]> {
    return this.regionsService.findAllVillages();
  }

  @Get('region/:regionId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all villages for a specific region' })
  @ApiParam({ name: 'regionId', description: 'Region UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'List of villages in the region',
    type: [Village],
  })
  @ApiResponse({ status: 404, description: 'Region not found' })
  async findVillagesByRegion(@Param('regionId') regionId: string): Promise<Village[]> {
    return this.regionsService.findVillagesByRegion(regionId);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get village by ID' })
  @ApiParam({ name: 'id', description: 'Village UUID', type: 'string' })
  @ApiResponse({
    status: 200,
    description: 'Village details with region information',
    type: Village,
  })
  @ApiResponse({ status: 404, description: 'Village not found' })
  async findOne(@Param('id') id: string): Promise<Village> {
    return this.regionsService.findVillageById(id);
  }
}

