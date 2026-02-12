import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('device_tokens')
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Index()
  @Column({ type: 'text' })
  fcm_token: string; // Firebase Cloud Messaging token

  @Column({ type: 'varchar', length: 100, nullable: true })
  device_id: string | null; // Unique device identifier

  @Column({ type: 'varchar', length: 50, nullable: true })
  device_type: string | null; // e.g., 'ios', 'android', 'web'

  @Column({ type: 'varchar', length: 100, nullable: true })
  device_model: string | null; // e.g., 'iPhone 13', 'Samsung Galaxy S21'

  @Column({ type: 'varchar', length: 50, nullable: true })
  os_version: string | null; // e.g., 'iOS 15.0', 'Android 12'

  @Column({ type: 'varchar', length: 100, nullable: true })
  app_version: string | null; // App version

  @Column({ type: 'boolean', default: true })
  is_active: boolean; // Whether this token is still active

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

