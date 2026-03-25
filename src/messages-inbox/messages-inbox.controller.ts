import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { MessagesInboxService } from './messages-inbox.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IsAdminGuard } from '../auth/guards/is-admin.guard';
import { UserType } from '../entities/user.entity';

@ApiTags('messages-inbox')
@Controller('messages-inbox')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessagesInboxController {
  constructor(private readonly service: MessagesInboxService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message (authenticated user)' })
  @ApiResponse({ status: 201, description: 'Message created' })
  async create(@Body() dto: CreateMessageDto, @Request() req) {
    return this.service.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get messages — admin sees all, user sees only their own',
  })
  @ApiQuery({ name: 'page', required: false, schema: { type: 'integer', default: 1 } })
  @ApiQuery({ name: 'limit', required: false, schema: { type: 'integer', default: 20 } })
  @ApiResponse({ status: 200, description: 'Paginated messages list' })
  async findAll(
    @Request() req,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findAll(
      req.user.id,
      req.user.user_type as UserType,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
  }

  @Get(':id')
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOperation({ summary: 'Get one message by ID' })
  @ApiResponse({ status: 200, description: 'Message detail' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Param('id', new ParseUUIDPipe()) id: string, @Request() req) {
    return this.service.findOne(id, req.user.id, req.user.user_type as UserType);
  }

  @Patch(':id/seen')
  @UseGuards(IsAdminGuard)
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOperation({ summary: 'Mark message as seen (admin only)' })
  @ApiResponse({ status: 200, description: 'Message marked as seen' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async markSeen(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.markSeen(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOperation({ summary: 'Delete a message (admin any, user own only)' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string, @Request() req) {
    return this.service.remove(id, req.user.id, req.user.user_type as UserType);
  }
}
