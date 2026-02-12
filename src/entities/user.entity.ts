import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Region } from './region.entity';
import { Village } from './village.entity';

export enum UserType {
  FARMER = 'farmer',
  COMPANY = 'company',
  ADMIN = 'admin',
}

export enum AccountStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  full_name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20, unique: true })
  phone: string;

  @Column({ type: 'varchar', length: 255 })
  password: string; // Hashed with bcrypt

  @Column({
    type: 'enum',
    enum: UserType,
    default: UserType.FARMER,
  })
  user_type: UserType;

  @Column({ type: 'text', array: true, default: [] })
  phones: string[]; // Additional phone numbers

  @Column({ type: 'text', array: true, default: [] })
  emails: string[]; // Email addresses

  @Column({ type: 'varchar', length: 500, nullable: true })
  profile_picture: string; // URL or path to profile picture

  @Column({ type: 'uuid', nullable: true })
  region_id: string; // Foreign key to regions table

  @ManyToOne(() => Region, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'region_id' })
  region: Region;

  @Column({ type: 'uuid', nullable: true })
  village_id: string; // Foreign key to villages table

  @ManyToOne(() => Village, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'village_id' })
  village: Village;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING,
    nullable: true,
  })
  account_status: AccountStatus; // For Company: pending, active, blocked

  @Column({ type: 'boolean', default: false })
  verified: boolean; // For Farmer: true after OTP, For Company: false until admin review

  @Column({ type: 'boolean', default: false })
  is_locked: boolean; // Account lock flag

  @Column({ type: 'boolean', default: false })
  terms_accepted: boolean; // Terms and conditions acceptance

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_active_at: Date;

  @Column({ type: 'text', nullable: true })
  refresh_token: string; // JWT refresh token

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

