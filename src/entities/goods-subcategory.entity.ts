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
import { GoodsCategory } from './goods-category.entity';
import { GoodsItem } from './goods-item.entity';

@Entity('catalog_subcategories')
export class GoodsSubcategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  category_id: string;

  @ManyToOne(() => GoodsCategory, (category) => category.subcategories, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'category_id' })
  category: GoodsCategory;

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

  @OneToMany(() => GoodsItem, (item) => item.subcategory)
  items: GoodsItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

