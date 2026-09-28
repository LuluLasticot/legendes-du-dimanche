'use client';

import { verifyDeterminism } from '@legendes/engine/selftest';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Status = { state: 'pending' } | { state: 'done'; ok: boolean; digest: string };

/** Runs the engine self-test in the visitor's browser: a live cross-engine determinism check. */
export function DeterminismBadge() {
  const t = useTranslations('engineCheck');
  const [status, setStatus] = useState<Status>({ state: 'pending' });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const { ok, actual } = verifyDeterminism();
      setStatus({ state: 'done', ok, digest: actual.digest });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const tone =
    status.state === 'pending'
      ? 'bg-chalk-faint'
      : status.ok
        ? 'bg-success shadow-[0_0_12px_var(--ld-color-success)]'
        : 'bg-danger shadow-[0_0_12px_var(--ld-color-danger)]';

  return (
    <p
      className="inline-flex items-center gap-2.5 text-xs text-chalk-muted"
      aria-live="polite"
      data-testid="determinism"
      data-state={status.state === 'pending' ? 'pending' : status.ok ? 'ok' : 'mismatch'}
    >
      <span className={`size-2 shrink-0 rounded-pill ${tone}`} aria-hidden />
      <span>
        {status.state === 'pending' ? t('pending') : status.ok ? t('ok') : t('mismatch')}
        {status.state === 'done' && (
          <span className="ml-1.5 font-mono text-chalk-faint">
            · {t('fingerprint', { digest: status.digest })}
          </span>
        )}
      </span>
    </p>
  );
}
