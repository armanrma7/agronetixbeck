import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { GoodsSubcategory } from './goods-subcategory.entity';

export enum CategoryType {
  GOODS = 'goods',
  SERVICE = 'service',
  RENT = 'rent',
}

@Entity('catalog_categories')
export class GoodsCategory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  key: string;

  @Index()
  @Column({
    type: 'enum',
    enum: CategoryType,
    default: CategoryType.GOODS,
  })
  type: CategoryType;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_am: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_en: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_ru: string;

  @OneToMany(() => GoodsSubcategory, (subcategory) => subcategory.category)
  subcategories: GoodsSubcategory[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

