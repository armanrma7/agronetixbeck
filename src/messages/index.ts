/**
 * Centralized message system for EN, HY, RU.
 * All user-facing messages and notifications MUST use getMessage(key, language).
 */
import { messages as en } from './messages.en';
import { messages as hy } from './messages.hy';
import { messages as ru } from './messages.ru';

export type SupportedLanguage = 'en' | 'hy' | 'ru';

type MessageBundle = Record<string, unknown>;
const bundles: Record<SupportedLanguage, MessageBundle> = {
  en: en as MessageBundle,
  hy: hy as MessageBundle,
  ru: ru as MessageBundle,
};

/**
 * Resolves a dot-notation key to the localized string.
 * @param key - Dot path, e.g. "announcements.createdVerificationNeeded"
 * @param language - User preference or device language (en, hy, ru)
 * @returns Localized string; falls back to English if key or language missing
 */
export function getMessage(
  key: string,
  language: SupportedLanguage = 'en',
): string {
  const bundle = bundles[language] ?? bundles.en;
  const parts = key.split('.');
  let current: unknown = bundle;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      break;
    }
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current === 'string') {
    return current;
  }
  // Fallback to English
  if (language !== 'en') {
    return getMessage(key, 'en');
  }
  return key;
}

export { messages as messagesEn } from './messages.en';
export { messages as messagesHy } from './messages.hy';
export { messages as messagesRu } from './messages.ru';
