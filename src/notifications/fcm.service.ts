import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(private configService: ConfigService) {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    try {
      const serviceAccount = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
      
      if (!serviceAccount) {
        this.logger.warn('FIREBASE_SERVICE_ACCOUNT not configured. FCM notifications will be disabled.');
        return;
      }

      let serviceAccountJson: admin.ServiceAccount;

      // Check if it's a file path (starts with ./ or / or contains .json)
      if (serviceAccount.startsWith('./') || serviceAccount.startsWith('/') || serviceAccount.endsWith('.json')) {
        // It's a file path - read the file
        const fs = require('fs');
        const path = require('path');
        const filePath = path.resolve(process.cwd(), serviceAccount);
        
        if (!fs.existsSync(filePath)) {
          this.logger.error(`Firebase service account file not found: ${filePath}`);
          return;
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        serviceAccountJson = JSON.parse(fileContent);
        this.logger.log(`Firebase service account loaded from file: ${filePath}`);
      } else {
        // It's a JSON string - parse it directly
        serviceAccountJson = JSON.parse(serviceAccount);
        this.logger.log('Firebase service account loaded from environment variable');
      }

      if (!admin.apps.length) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccountJson),
        });
      } else {
        this.firebaseApp = admin.apps[0];
      }
    } catch (error) {
      this.logger.error('Failed to initialize Firebase Admin:', error);
    }
  }

  /**
   * Send notification to a single device
   */
  async sendToDevice(
    token: string,
    payload: NotificationPayload
  ): Promise<boolean> {
    if (!this.firebaseApp) {
      this.logger.warn('Firebase not initialized. Skipping notification.');
      return false;
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`Notification sent successfully: ${response}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send notification to device ${token}:`, error);
      
      // Handle invalid token
      if (error.code === 'messaging/invalid-registration-token' || 
          error.code === 'messaging/registration-token-not-registered') {
        this.logger.warn(`Invalid or unregistered token: ${token}`);
      }
      
      return false;
    }
  }

  /**
   * Send notification to multiple devices.
   * Returns invalidTokens: FCM tokens that are invalid/expired (caller should deactivate them).
   */
  async sendToDevices(
    tokens: string[],
    payload: NotificationPayload
  ): Promise<{ successCount: number; failureCount: number; invalidTokens: string[]; failureReason?: string }> {
    if (!this.firebaseApp || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
        android: {
          priority: 'high',
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      const invalidTokens: string[] = [];
      let failureReason: string | undefined;

      if (response.responses) {
        response.responses.forEach((resp, idx) => {
          const token = tokens[idx];
          if (!resp.success && resp.error) {
            const code = (resp.error as any).code || '';
            const msg = (resp.error as any).message || resp.error.toString();
            if (!failureReason) failureReason = code;
            this.logger.warn(
              `FCM send failed for device: ${code} - ${msg} (token: ${token?.substring(0, 20)}...)`
            );
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(token);
            }
          }
        });
      }

      this.logger.log(
        `Notifications sent: ${response.successCount} successful, ${response.failureCount} failed`
      );

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens,
        failureReason,
      };
    } catch (error) {
      this.logger.error('Failed to send multicast notification:', error);
      return { successCount: 0, failureCount: tokens.length, invalidTokens: [] };
    }
  }

  /**
   * Send notification to a topic
   */
  async sendToTopic(topic: string, payload: NotificationPayload): Promise<boolean> {
    if (!this.firebaseApp) {
      this.logger.warn('Firebase not initialized. Skipping notification.');
      return false;
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data || {},
      };

      const response = await admin.messaging().send(message);
      this.logger.log(`Notification sent to topic ${topic}: ${response}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send notification to topic ${topic}:`, error);
      return false;
    }
  }
}

