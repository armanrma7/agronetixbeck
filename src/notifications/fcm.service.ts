import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JWT } from 'google-auth-library';

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private jwtClient: JWT | null = null;
  private projectId: string | null = null;

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

      let serviceAccountJson: any;

      if (serviceAccount.startsWith('./') || serviceAccount.startsWith('/') || serviceAccount.endsWith('.json')) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.resolve(process.cwd(), serviceAccount);

        if (!fs.existsSync(filePath)) {
          this.logger.error(`Firebase service account file not found: ${filePath}`);
          return;
        }

        serviceAccountJson = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.logger.log(`Firebase service account loaded from file: ${filePath}`);
      } else {
        serviceAccountJson = JSON.parse(serviceAccount);
        this.logger.log('Firebase service account loaded from environment variable');
      }

      this.projectId = serviceAccountJson.project_id;

      this.jwtClient = new JWT({
        email: serviceAccountJson.client_email,
        key: serviceAccountJson.private_key,
        scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
      });

      this.logger.log(`FCM HTTP v1 client initialized for project: ${this.projectId}`);
    } catch (error) {
      this.logger.error('Failed to initialize FCM client:', error);
    }
  }

  /**
   * Get a fresh OAuth2 access token from the service account
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.jwtClient) return null;
    try {
      const tokenResponse = await this.jwtClient.getAccessToken();
      return tokenResponse.token ?? null;
    } catch (error) {
      this.logger.error(`Failed to get FCM access token: ${error.message}`);
      return null;
    }
  }

  /**
   * Send a single FCM message via HTTP v1 API
   */
  private async sendMessage(message: Record<string, any>): Promise<{ success: boolean; error?: string }> {
    const accessToken = await this.getAccessToken();
    if (!accessToken) {
      return { success: false, error: 'Could not obtain access token' };
    }

    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;
    const body = JSON.stringify({ message });
    console.info(body);

    return new Promise((resolve) => {
      const https = require('https');
      const urlObj = new URL(url);

      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };

      const req = https.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: any) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({ success: true });
          } else {
            let errorCode = `HTTP ${res.statusCode}`;
            try {
              const parsed = JSON.parse(data);
              errorCode = parsed?.error?.message || errorCode;
            } catch {
              // keep raw status
            }
            resolve({ success: false, error: errorCode });
          }
        });
      });

      req.on('error', (err: any) => resolve({ success: false, error: err.message }));
      req.write(body);
      req.end();
    });
  }

  /**
   * Send notification to a single device
   */
  async sendToDevice(token: string, payload: NotificationPayload): Promise<boolean> {
    if (!this.jwtClient) {
      this.logger.warn('FCM not initialized. Skipping notification.');
      return false;
    }

    const result = await this.sendMessage({
      token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
      android: { priority: 'high' },
      apns: { payload: { aps: { sound: 'default' } } },
    });

    if (result.success) {
      this.logger.log(`Notification sent successfully to device`);
    } else {
      this.logger.warn(`Failed to send notification to device ${token.substring(0, 20)}...: ${result.error}`);
    }

    return result.success;
  }

  /**
   * Send notification to multiple devices.
   * Returns invalidTokens: FCM tokens that are invalid/expired (caller should deactivate them).
   */
  async sendToDevices(
    tokens: string[],
    payload: NotificationPayload,
  ): Promise<{ successCount: number; failureCount: number; invalidTokens: string[]; failureReason?: string }> {
    if (!this.jwtClient || tokens.length === 0) {
      return { successCount: 0, failureCount: 0, invalidTokens: [] };
    }

    const results = await Promise.all(
      tokens.map(async (token) => {
        const result = await this.sendMessage({
          token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data || {},
          android: { priority: 'high' },
          apns: { payload: { aps: { sound: 'default' } } },
        });
        return { token, ...result };
      }),
    );

    const invalidTokens: string[] = [];
    let failureReason: string | undefined;
    let successCount = 0;
    let failureCount = 0;

    for (const r of results) {
      if (r.success) {
        successCount++;
      } else {
        failureCount++;
        if (!failureReason) failureReason = r.error;
        this.logger.warn(`FCM send failed for device (${r.token.substring(0, 20)}...): ${r.error}`);

        if (
          r.error?.includes('UNREGISTERED') ||
          r.error?.includes('INVALID_ARGUMENT') ||
          r.error?.includes('invalid-registration-token') ||
          r.error?.includes('registration-token-not-registered')
        ) {
          invalidTokens.push(r.token);
        }
      }
    }

    this.logger.log(`Notifications sent: ${successCount} successful, ${failureCount} failed`);

    return { successCount, failureCount, invalidTokens, failureReason };
  }

  /**
   * Send notification to a topic
   */
  async sendToTopic(topic: string, payload: NotificationPayload): Promise<boolean> {
    if (!this.jwtClient) {
      this.logger.warn('FCM not initialized. Skipping notification.');
      return false;
    }

    const result = await this.sendMessage({
      topic,
      notification: { title: payload.title, body: payload.body },
      data: payload.data || {},
    });

    if (result.success) {
      this.logger.log(`Notification sent to topic ${topic}`);
    } else {
      this.logger.error(`Failed to send notification to topic ${topic}: ${result.error}`);
    }

    return result.success;
  }
}
