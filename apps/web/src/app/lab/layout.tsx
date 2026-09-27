import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('lab');
  // Development tools: reachable by testers, never indexed.
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default function LabLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-pitch-950">{children}</div>;
}
