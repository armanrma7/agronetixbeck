import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../entities/message.entity';
import { MessagesInboxService } from './messages-inbox.service';
import { MessagesInboxController } from './messages-inbox.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Message])],
  providers: [MessagesInboxService],
  controllers: [MessagesInboxController],
  exports: [MessagesInboxService],
})
export class MessagesInboxModule {}
