/**
 * Exposes centralized messages for the mobile app.
 * Use these endpoints to resolve messageKey from notifications (e.g. getMessage(key, language)).
 */
import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { getMessage, SupportedLanguage } from './index';
import { messages as messagesEn } from './messages.en';
import { messages as messagesHy } from './messages.hy';
import { messages as messagesRu } from './messages.ru';

const BUNDLES: Record<SupportedLanguage, Record<string, unknown>> = {
  en: messagesEn as Record<string, unknown>,
  hy: messagesHy as Record<string, unknown>,
  ru: messagesRu as Record<string, unknown>,
};

@ApiTags('messages')
@Controller('messages')
export class MessagesController {
  /**
   * Resolve a single message key (e.g. for notification display). Must be before :lang route.
   */
  @Get('resolve')
  @ApiOperation({ summary: 'Resolve a message key to localized string' })
  @ApiQuery({ name: 'key', required: true, description: 'Dot path, e.g. announcements.createdVerificationNeeded' })
  @ApiQuery({ name: 'lang', required: false, description: 'Language: en, hy, ru (default: en)' })
  resolve(
    @Query('key') key: string,
    @Query('lang') lang?: string,
  ): { value: string } {
    const supported: SupportedLanguage = ['en', 'hy', 'ru'].includes(lang || '') ? (lang as SupportedLanguage) : 'en';
    return { value: getMessage(key || '', supported) };
  }

  /**
   * Get full message bundle for a language (for mobile to cache).
   */
  @Get(':lang')
  @ApiOperation({ summary: 'Get full message bundle for a language (en, hy, ru)' })
  @ApiParam({ name: 'lang', enum: ['en', 'hy', 'ru'] })
  getBundle(@Param('lang') lang: string): Record<string, unknown> {
    const supported = ['en', 'hy', 'ru'].includes(lang) ? (lang as SupportedLanguage) : 'en';
    return BUNDLES[supported] as unknown as Record<string, unknown>;
  }
}
