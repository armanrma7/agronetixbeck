import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum OtpChannel {
  SMS = 'sms',
  VIBER = 'viber',
  WHATSAPP = 'whatsapp',
  TELEGRAM = 'telegram',
}

@Entity('otp_codes')
export class OtpCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255 })
  hashed_code: string; // Hashed OTP code

  @Column({
    type: 'enum',
    enum: OtpChannel,
    default: OtpChannel.SMS,
  })
  channel: OtpChannel;

  @Column({ type: 'timestamp' })
  expires_at: Date;

  @Column({ type: 'int', default: 0 })
  attempts: number; // Number of wrong verification attempts

  @Column({ type: 'int', default: 0 })
  resend_count: number; // Number of times OTP was resent (initial send = 0, first resend = 1, ...)

  @Column({ type: 'boolean', default: false })
  verified: boolean; // True once verified; record is kept for 1 hr for rate-limit tracking then deleted

  @Column({ type: 'varchar', length: 50, nullable: true })
  purpose: string; // 'registration', 'forgot_password', etc.

  @CreateDateColumn()
  created_at: Date;
}

