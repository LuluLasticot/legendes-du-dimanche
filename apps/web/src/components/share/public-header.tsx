import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/** The game's name above a public page, back to the home page. */
export async function PublicHeader() {
  const t = await getTranslations('share');
  return (
    <header className="mx-auto w-full max-w-5xl px-5 pt-6 sm:px-8">
      <Link
        href="/"
        className="font-display text-xl tracking-wide text-floodlight-400 uppercase hover:text-floodlight-300"
      >
        {t('brand')}
      </Link>
    </header>
  );
}
