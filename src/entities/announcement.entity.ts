import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Application } from './application.entity';
import { GoodsCategory } from './goods-category.entity';
import { GoodsItem } from './goods-item.entity';

export enum AnnouncementType {
  SELL = 'sell',
  BUY = 'buy',
}

export enum AnnouncementCategory {
  GOODS = 'goods',
  SERVICE = 'service',
  RENT = 'rent',
}

export enum AnnouncementStatus {
  PENDING = 'pending',
  PUBLISHED = 'published',
  CLOSED = 'closed',
  CANCELED = 'canceled',
  BLOCKED = 'blocked',
}

export enum Unit {
  KG = 'kg',
  TON = 'ton',
  PCS = 'pcs',
  LITER = 'liter',
  BAG = 'bag',
  M2 = 'm2',
  HA = 'ha',
}

@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AnnouncementType,
  })
  type: AnnouncementType;

  @Column({
    type: 'enum',
    enum: AnnouncementCategory,
  })
  category: AnnouncementCategory;

  // Foreign key to catalog_categories
  @Index()
  @Column({ type: 'uuid' })
  group_id: string;

  @ManyToOne(() => GoodsCategory)
  @JoinColumn({ name: 'group_id' })
  group: GoodsCategory;

  // Foreign key to catalog_items
  @Index()
  @Column({ type: 'uuid' })
  item_id: string;

  @ManyToOne(() => GoodsItem)
  @JoinColumn({ name: 'item_id' })
  item: GoodsItem;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'uuid' })
  owner_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  @Column({
    type: 'enum',
    enum: AnnouncementStatus,
    default: AnnouncementStatus.PENDING,
  })
  status: AnnouncementStatus;

  // User who closed the announcement (admin or owner)
  @Column({ type: 'uuid', nullable: true })
  closed_by: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'closed_by' })
  closedByUser: User;

  // ====================================
  // CONDITIONAL FIELDS (category-specific)
  // ====================================

  // For category = 'goods': count is required
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  count: number | null;

  // For category = 'goods': daily_limit is required
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  daily_limit: number | null;

  // Available quantity (calculated field for goods)
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  available_quantity: number;

  // Unit is optional for all categories
  @Column({
    type: 'enum',
    enum: Unit,
    nullable: true,
  })
  unit: Unit | null;

  // Images (required for 'goods' and 'rent')
  @Column({ type: 'text', array: true, default: [] })
  images: string[];

  // For category = 'rent': date_from and date_to are required
  @Column({ type: 'date', nullable: true })
  date_from: Date | null;

  @Column({ type: 'date', nullable: true })
  date_to: Date | null;

  // min_area is optional (typically for rent category)
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  min_area: number | null;

  // ====================================
  // LOCATION FIELDS
  // ====================================

  // Array of region IDs
  @Column({ type: 'uuid', array: true, default: [] })
  regions: string[];

  // Array of village IDs
  @Column({ type: 'uuid', array: true, default: [] })
  villages: string[];

  @OneToMany(() => Application, (application) => application.announcement)
  applications: Application[];

  // Views count (calculated field)
  @Column({ type: 'integer', default: 0 })
  views_count: number;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updated_at: Date;
}
