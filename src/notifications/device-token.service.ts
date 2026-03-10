import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { DeviceToken } from '../entities/device-token.entity';
import { RegisterDeviceDto } from '../device-tokens/dto/register-device.dto';

@Injectable()
export class DeviceTokenService {
  constructor(
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
  ) {}

  /**
   * Ensure only ONE device per user.
   * Removes all other device tokens for this user, keeping only keepId.
   */
  private async removeOtherUserDevices(userId: string, keepId: string): Promise<void> {
    await this.deviceTokenRepository.delete({
      user_id: userId,
      id: Not(keepId),
    });
  }

  /**
   * Register or update a device token for a user
   * Priority: device_id > fcm_token
   * - If device_id matches, update that device (even if fcm_token is different)
   * - If no device_id match but fcm_token matches, update that device
   * - Otherwise, create new device
   */
  async registerDevice(
    userId: string,
    dto: RegisterDeviceDto,
  ): Promise<DeviceToken> {
    let deviceToken: DeviceToken | null = null;

    // Priority 1: Check if device with same device_id exists (if device_id is provided)
    if (dto.device_id) {
      deviceToken = await this.deviceTokenRepository.findOne({
        where: {
          user_id: userId,
          device_id: dto.device_id,
        },
      });

      if (deviceToken) {
        // Update existing device with same device_id
        // Update FCM token and all other fields
        deviceToken.fcm_token = dto.fcm_token;
        deviceToken.device_type = dto.device_type || deviceToken.device_type;
        deviceToken.device_model = dto.device_model || deviceToken.device_model;
        deviceToken.os_version = dto.os_version || deviceToken.os_version;
        deviceToken.app_version = dto.app_version || deviceToken.app_version;
        deviceToken.is_active = true;

        // Deactivate any other tokens with the same FCM token (if FCM token changed)
        if (deviceToken.fcm_token !== dto.fcm_token) {
          const otherTokensWithSameFcm = await this.deviceTokenRepository.find({
            where: {
              user_id: userId,
              fcm_token: dto.fcm_token,
            },
          });

          for (const otherToken of otherTokensWithSameFcm) {
            if (otherToken.id !== deviceToken.id) {
              otherToken.is_active = false;
              await this.deviceTokenRepository.save(otherToken);
            }
          }
        }

        const saved = await this.deviceTokenRepository.save(deviceToken);
        // Enforce single device per user
        await this.removeOtherUserDevices(userId, saved.id);
        return saved;
      }
    }

    // Priority 2: Check if device token already exists for this user and FCM token
    deviceToken = await this.deviceTokenRepository.findOne({
      where: {
        user_id: userId,
        fcm_token: dto.fcm_token,
      },
    });

    if (deviceToken) {
      // Update existing token with same FCM token
      deviceToken.device_id = dto.device_id || deviceToken.device_id;
      deviceToken.device_type = dto.device_type || deviceToken.device_type;
      deviceToken.device_model = dto.device_model || deviceToken.device_model;
      deviceToken.os_version = dto.os_version || deviceToken.os_version;
      deviceToken.app_version = dto.app_version || deviceToken.app_version;
      deviceToken.is_active = true;

      // If device_id was provided and it's different, deactivate other devices with same device_id
      if (dto.device_id && deviceToken.device_id !== dto.device_id) {
        const oldTokensWithSameDeviceId = await this.deviceTokenRepository.find({
          where: {
            user_id: userId,
            device_id: dto.device_id,
            is_active: true,
          },
        });

        for (const oldToken of oldTokensWithSameDeviceId) {
          if (oldToken.id !== deviceToken.id) {
            oldToken.is_active = false;
            await this.deviceTokenRepository.save(oldToken);
          }
        }
      }

      const saved = await this.deviceTokenRepository.save(deviceToken);
      // Enforce single device per user
      await this.removeOtherUserDevices(userId, saved.id);
      return saved;
    }

    // Priority 3: Create new device token
    deviceToken = this.deviceTokenRepository.create({
      user_id: userId,
      fcm_token: dto.fcm_token,
      device_id: dto.device_id || null,
      device_type: dto.device_type || null,
      device_model: dto.device_model || null,
      os_version: dto.os_version || null,
      app_version: dto.app_version || null,
      is_active: true,
    });

    const savedToken = await this.deviceTokenRepository.save(deviceToken);

    // Deactivate old tokens for the same device_id (if provided)
    // This ensures only one active token per device
    if (dto.device_id) {
      const oldTokens = await this.deviceTokenRepository.find({
        where: {
          user_id: userId,
          device_id: dto.device_id,
          is_active: true,
        },
      });

      for (const oldToken of oldTokens) {
        if (oldToken.id !== savedToken.id) {
          oldToken.is_active = false;
          await this.deviceTokenRepository.save(oldToken);
        }
      }
    }

    // Enforce single device per user
    await this.removeOtherUserDevices(userId, savedToken.id);
    return savedToken;
  }

  /**
   * Get all devices for a user
   */
  async getUserDevices(userId: string): Promise<DeviceToken[]> {
    return this.deviceTokenRepository.find({
      where: { user_id: userId },
      relations: ['user'],
      select: {
        id: true,
        user_id: true,
        fcm_token: true,
        device_id: true,
        device_type: true,
        device_model: true,
        os_version: true,
        app_version: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        user: {
          id: true,
          full_name: true,
        },
      },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Admin: get devices for all users (optionally filtered by user_id).
   */
  async getDevicesForAdmin(userId?: string): Promise<DeviceToken[]> {
    return this.deviceTokenRepository.find({
      where: userId ? { user_id: userId } : {},
      relations: ['user'],
      select: {
        id: true,
        user_id: true,
        fcm_token: true,
        device_id: true,
        device_type: true,
        device_model: true,
        os_version: true,
        app_version: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        user: {
          id: true,
          full_name: true,
        },
      },
      order: { created_at: 'DESC' },
    });
  }

  /**
   * Get a device by ID (for a specific user)
   */
  async getDeviceById(id: string, userId: string): Promise<DeviceToken> {
    const device = await this.deviceTokenRepository.findOne({
      where: { id, user_id: userId },
    });

    if (!device) {
      throw new NotFoundException(`Device with ID ${id} not found`);
    }

    return device;
  }

  /**
   * Remove a device token by ID
   */
  async removeDevice(id: string, userId: string): Promise<void> {
    const device = await this.getDeviceById(id, userId);
    await this.deviceTokenRepository.remove(device);
  }

  /**
   * Remove a device token by FCM token
   */
  async removeDeviceByFcmToken(fcmToken: string, userId: string): Promise<void> {
    const device = await this.deviceTokenRepository.findOne({
      where: { fcm_token: fcmToken, user_id: userId },
    });

    if (!device) {
      throw new NotFoundException(`Device with FCM token not found`);
    }

    await this.deviceTokenRepository.remove(device);
  }

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
