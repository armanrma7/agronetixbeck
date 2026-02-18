import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  APPLICATION_CREATED = 'application_created',
  APPLICATION_APPROVED = 'application_approved',
  APPLICATION_REJECTED = 'application_rejected',
  APPLICATION_CLOSED = 'application_closed',
  ANNOUNCEMENT_PUBLISHED = 'announcement_published',
  ANNOUNCEMENT_CLOSED = 'announcement_closed',
  ANNOUNCEMENT_BLOCKED = 'announcement_blocked',
  ANNOUNCEMENT_CANCELED = 'announcement_canceled',
  ACCOUNT_STATUS_CHANGED = 'account_status_changed',
  GENERAL = 'general',
}

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({
    type: 'enum',
    enum: NotificationType,
    default: NotificationType.GENERAL,
  })
  type: NotificationType;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, any>;

  @Index()
  @Column({ type: 'boolean', default: false })
  is_seen: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  seen_at: Date | null;

  @Index()
  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;
}
