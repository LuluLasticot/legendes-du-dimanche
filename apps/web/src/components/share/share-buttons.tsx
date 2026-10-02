'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Sharing a public page in few taps (GDD §11): the phone's share sheet (with the story image
 * when the phone can share files), else copying the link; and the story image to download.
 */
export function ShareButtons({
  title,
  text,
  storyUrl,
  storyName,
}: {
  title: string;
  text: string;
  /** Same-origin URL of the story image (1080 × 1920). */
  storyUrl?: string;
  storyName?: string;
}) {
  const t = useTranslations('share');
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard refused (insecure context): nothing else to do.
    }
  };

  const share = async (): Promise<void> => {
    const url = window.location.href;
    if (!('share' in navigator)) return copy();
    try {
      if (storyUrl && storyName && 'canShare' in navigator) {
        const blob = await (await fetch(storyUrl)).blob();
        const file = new File([blob], storyName, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title, text, url, files: [file] });
          return;
        }
      }
      await navigator.share({ title, text, url });
    } catch (error) {
      // Closing the share sheet is not an error worth showing.
      if (error instanceof Error && error.name !== 'AbortError') await copy();
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => void share()}
        className="rounded-md bg-floodlight-400 px-4 py-2 text-sm font-bold text-pitch-950 hover:bg-floodlight-300"
      >
        {t('native')}
      </button>
      <button
        type="button"
        onClick={() => void copy()}
        className="rounded-md border border-chalk/20 px-4 py-2 text-sm font-semibold text-chalk hover:border-floodlight-400"
      >
        {copied ? t('copied') : t('copy')}
      </button>
      {storyUrl && (
        <a
          href={storyUrl}
          download={storyName}
          className="rounded-md border border-chalk/20 px-4 py-2 text-sm font-semibold text-chalk hover:border-floodlight-400"
        >
          {t('story')}
        </a>
      )}
      <span role="status" className="sr-only">
        {copied ? t('copied') : ''}
      </span>
    </div>
  );
}
