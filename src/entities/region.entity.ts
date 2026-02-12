import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Village } from './village.entity';

@Entity('regions')
export class Region {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_am: string; // Armenian name

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_en: string; // English name

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_ru: string; // Russian name

  @OneToMany(() => Village, (village) => village.region)
  villages: Village[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

