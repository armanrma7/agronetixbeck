import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceTokensController } from './device-tokens.controller';
import { DeviceTokenService } from '../notifications/device-token.service';
import { DeviceToken } from '../entities/device-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceToken]),
  ],
  controllers: [DeviceTokensController],
  providers: [DeviceTokenService],
  exports: [DeviceTokenService],
})
export class DeviceTokensModule {}
