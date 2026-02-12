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
  attempts: number; // Number of verification attempts

  @Column({ type: 'boolean', default: false })
  verified: boolean; // Whether OTP has been verified

  @Column({ type: 'varchar', length: 50, nullable: true })
  purpose: string; // 'registration', 'forgot_password', etc.

  @CreateDateColumn()
  created_at: Date;
}

