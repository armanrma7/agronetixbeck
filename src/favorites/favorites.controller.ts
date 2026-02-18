import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { FavoritesService } from './favorites.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('favorites')
@Controller('favorites')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an announcement to favorites' })
  @ApiResponse({
    status: 201,
    description: 'Announcement added to favorites successfully',
  })
  @ApiResponse({ status: 400, description: 'Only published announcements can be favorited' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  @ApiResponse({ status: 409, description: 'Announcement already in favorites' })
  async create(@Body() createDto: CreateFavoriteDto, @Request() req) {
    return this.favoritesService.create(req.user.id, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all favorite announcements (only published)' })
  @ApiResponse({
    status: 200,
    description: 'List of favorite announcements',
    type: [Object],
  })
  async findAll(@Request() req) {
    return this.favoritesService.findAll(req.user.id);
  }

  @Delete(':announcementId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an announcement from favorites' })
  @ApiParam({
    name: 'announcementId',
    description: 'ID of the announcement to remove from favorites',
    type: String,
  })
  @ApiResponse({
    status: 204,
    description: 'Announcement removed from favorites successfully',
  })
  @ApiResponse({ status: 404, description: 'Favorite not found' })
  async remove(@Param('announcementId') announcementId: string, @Request() req) {
    await this.favoritesService.remove(req.user.id, announcementId);
  }
}
