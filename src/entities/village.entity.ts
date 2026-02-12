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
import { Region } from './region.entity';

@Entity('villages')
export class Village {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  region_id: string;

  @ManyToOne(() => Region, (region) => region.villages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'region_id' })
  region: Region;

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_am: string; // Armenian name

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_en: string; // English name

  @Index()
  @Column({ type: 'varchar', length: 255 })
  name_ru: string; // Russian name

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

