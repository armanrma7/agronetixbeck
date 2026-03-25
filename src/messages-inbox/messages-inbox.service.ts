import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from '../entities/message.entity';
import { UserType } from '../entities/user.entity';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesInboxService {
  private readonly logger = new Logger(MessagesInboxService.name);

  constructor(
    @InjectRepository(Message)
    private messageRepository: Repository<Message>,
  ) {}

  /**
   * User sends a message (saved to DB, visible to admins).
   */
  async create(userId: string, dto: CreateMessageDto): Promise<Message> {
    const message = this.messageRepository.create({
      user_id: userId,
      subject: dto.subject ?? null,
      body: dto.body,
      is_seen: false,
      seen_at: null,
    });
    return this.messageRepository.save(message);
  }

  /**
   * Get messages:
   * - Admin: all messages (with sender info), ordered newest first.
   * - Regular user: only their own messages.
   */
  async findAll(
    userId: string,
    userType: UserType,
    page = 1,
    limit = 20,
  ): Promise<{ messages: Message[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const qb = this.messageRepository
      .createQueryBuilder('msg')
      .leftJoin('msg.user', 'user')
      .addSelect(['user.id', 'user.full_name', 'user.phone'])
      .orderBy('msg.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (userType !== UserType.ADMIN) {
      qb.where('msg.user_id = :userId', { userId });
    }

    const [messages, total] = await qb.getManyAndCount();
    return { messages, total, page, limit };
  }

  /**
   * Get one message by ID.
   * Admin can see any; user can only see their own.
   */
  async findOne(id: string, userId: string, userType: UserType): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (userType !== UserType.ADMIN && message.user_id !== userId) {
      throw new ForbiddenException('You can only view your own messages');
    }

    return message;
  }

  /**
   * Mark message as seen. Admin only.
   */
  async markSeen(id: string): Promise<Message> {
    const message = await this.messageRepository.findOne({ where: { id } });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.is_seen) {
      return message;
    }

    message.is_seen = true;
    message.seen_at = new Date();
    return this.messageRepository.save(message);
  }

  /**
   * Delete a message. Admin can delete any; user can only delete their own.
   */
  async remove(id: string, userId: string, userType: UserType): Promise<void> {
    const message = await this.messageRepository.findOne({ where: { id } });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (userType !== UserType.ADMIN && message.user_id !== userId) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    await this.messageRepository.remove(message);
  }
}
