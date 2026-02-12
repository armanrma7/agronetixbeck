import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OtpCode } from '../entities/otp-code.entity';
import { OtpService } from './services/otp.service';
import { SmsProviderService } from './services/sms-provider.service';

@Module({
  imports: [TypeOrmModule.forFeature([OtpCode])],
  providers: [OtpService, SmsProviderService],
  exports: [OtpService, SmsProviderService],
})
export class CommonModule {}

