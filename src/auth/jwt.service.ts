import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { User } from '../entities/user.entity';

export interface TokenPayload {
  sub: string; // user id
  phone: string;
  user_type: string;
  verified: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

@Injectable()
export class AuthJwtService {
  private readonly accessTokenExpiresIn: string;
  private readonly refreshTokenExpiresIn: string;

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {
    this.accessTokenExpiresIn = this.configService.get('JWT_EXPIRES_IN') || '15m';
    this.refreshTokenExpiresIn = this.configService.get('JWT_REFRESH_EXPIRES_IN') || '7d';
  }

  /**
   * Generate access token and refresh token for user
   */
  async generateTokens(user: User): Promise<TokenResponse> {
    const payload: TokenPayload = {
      sub: user.id,
      phone: user.phone,
      user_type: user.user_type,
      verified: user.verified,
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.accessTokenExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: this.refreshTokenExpiresIn,
      }),
    ]);

    // Calculate expires_in in seconds
    const expiresInMatch = this.accessTokenExpiresIn.match(/(\d+)([smhd])/);
    let expiresInSeconds = 900; // default 15 minutes
    if (expiresInMatch) {
      const value = parseInt(expiresInMatch[1]);
      const unit = expiresInMatch[2];
      switch (unit) {
        case 's':
          expiresInSeconds = value;
          break;
        case 'm':
          expiresInSeconds = value * 60;
          break;
        case 'h':
          expiresInSeconds = value * 3600;
          break;
        case 'd':
          expiresInSeconds = value * 86400;
          break;
      }
    }

    return {
      access_token,
      refresh_token,
      expires_in: expiresInSeconds,
    };
  }

  /**
   * Verify access token
   */
  async verifyToken(token: string): Promise<TokenPayload> {
    return this.jwtService.verifyAsync<TokenPayload>(token);
  }

  /**
   * Verify refresh token
   */
  async verifyRefreshToken(token: string): Promise<TokenPayload> {
    return this.jwtService.verifyAsync<TokenPayload>(token);
  }

  /**
   * Generate new access token from refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const newPayload: TokenPayload = {
      sub: payload.sub,
      phone: payload.phone,
      user_type: payload.user_type,
      verified: payload.verified,
    };

    const access_token = await this.jwtService.signAsync(newPayload, {
      expiresIn: this.accessTokenExpiresIn,
    });

    // Calculate expires_in in seconds
    const expiresInMatch = this.accessTokenExpiresIn.match(/(\d+)([smhd])/);
    let expiresInSeconds = 900; // default 15 minutes
    if (expiresInMatch) {
      const value = parseInt(expiresInMatch[1]);
      const unit = expiresInMatch[2];
      switch (unit) {
        case 's':
          expiresInSeconds = value;
          break;
        case 'm':
          expiresInSeconds = value * 60;
          break;
        case 'h':
          expiresInSeconds = value * 3600;
          break;
        case 'd':
          expiresInSeconds = value * 86400;
          break;
      }
    }

    return {
      access_token,
      expires_in: expiresInSeconds,
    };
  }
}

