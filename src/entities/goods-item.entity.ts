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
import { GoodsSubcategory } from './goods-subcategory.entity';

@Entity('catalog_items')
export class GoodsItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  subcategory_id: string;

  @ManyToOne(() => GoodsSubcategory, (subcategory) => subcategory.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'subcategory_id' })
  subcategory: GoodsSubcategory;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_am: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_en: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_ru: string;

  @Column({ type: 'jsonb', nullable: true })
  measurements: Array<{ hy: string; en: string; ru: string }> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

