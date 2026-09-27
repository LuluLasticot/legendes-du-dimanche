import type { messages } from './request.ts';

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'fr';
    Messages: typeof messages;
  }
}
