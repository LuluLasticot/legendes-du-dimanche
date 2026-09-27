import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Big_Shoulders, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const display = Big_Shoulders({
  subsets: ['latin'],
  weight: ['700', '800', '900'],
  variable: '--ld-font-display-family',
  display: 'swap',
  // No metric overrides are published for Big Shoulders: fall back to a condensed system font.
  adjustFontFallback: false,
  fallback: ['Arial Narrow', 'sans-serif'],
});

const sans = Manrope({
  subsets: ['latin'],
  variable: '--ld-font-sans-family',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return { title: t('title'), description: t('description') };
}

export const viewport: Viewport = {
  themeColor: '#06140f',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
