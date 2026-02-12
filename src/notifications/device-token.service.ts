import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceToken } from '../entities/device-token.entity';

@Injectable()
export class DeviceTokenService {
  constructor(
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
  ) {}

  /**
   * Get all active FCM tokens for a user
   */
  async getActiveTokensForUser(userId: string): Promise<string[]> {
    const tokens = await this.deviceTokenRepository.find({
      where: {
        user_id: userId,
        is_active: true,
      },
      select: ['fcm_token'],
    });

    return tokens.map((token) => token.fcm_token);
  }

  /**
   * Deactivate a specific FCM token
   */
  async deactivateToken(fcmToken: string): Promise<void> {
    await this.deviceTokenRepository.update(
      { fcm_token: fcmToken },
      { is_active: false }
    );
  }

  /**
   * Deactivate all tokens for a user
   */
  async deactivateAllUserTokens(userId: string): Promise<void> {
    await this.deviceTokenRepository.update(
      { user_id: userId },
      { is_active: false }
    );
  }
}

