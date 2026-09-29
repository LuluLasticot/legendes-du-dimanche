'use client';

import type { GesturePoint } from '@legendes/engine/moments';
import type { SandboxStep } from '@legendes/render3d';
import { useTranslations } from 'next-intl';

/** Past this gauge value a penalty gets hard to control (engine: moments.penaltyGauge). */
const GAUGE_SWEET_END = 0.82;

/** The finger trace over the 3D canvas (viewport-height units, same as the engine's gesture). */
export function GestureTrace({
  trace,
  aspect,
}: {
  trace: readonly GesturePoint[] | null;
  aspect: number;
}) {
  if (!trace || trace.length < 2) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 size-full"
      viewBox={`0 0 ${aspect} 1`}
      preserveAspectRatio="xMinYMin meet"
      aria-hidden
    >
      <polyline
        points={trace.map((p) => `${p.u},${p.v}`).join(' ')}
        fill="none"
        // CSS variables only work through style, not presentation attributes.
        style={{ stroke: 'var(--ld-color-floodlight-400)' }}
        strokeWidth={0.008}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  );
}

/** The penalty power gauge: sweet spot, then the zone where the strike gets away. */
export function PowerGauge({ value }: { value: number | null }) {
  const t = useTranslations('lab.ball');
  if (value === null) return null;
  return (
    <div
      className="pointer-events-none absolute top-1/2 right-4 h-48 w-4 -translate-y-1/2 overflow-hidden rounded-pill border border-chalk/30 bg-pitch-950/70"
      role="meter"
      aria-label={t('gauge')}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
    >
      <div
        className="absolute inset-x-0 bg-floodlight-400/35"
        style={{ bottom: '55%', height: `${(GAUGE_SWEET_END - 0.55) * 100}%` }}
      />
      <div
        className="absolute inset-x-0 top-0 bg-danger/50"
        style={{ height: `${(1 - GAUGE_SWEET_END) * 100}%` }}
      />
      <div
        className="absolute inset-x-0 h-1 bg-chalk"
        style={{ bottom: `calc(${value * 100}% - 2px)` }}
      />
    </div>
  );
}

/** What to do now, for the current step of the situation. */
export function StepHint({ step, className }: { step: SandboxStep | null; className?: string }) {
  const t = useTranslations('lab.ball');
  if (!step || step === 'playing') return null;
  return (
    <p
      className={
        className ??
        'pointer-events-none absolute bottom-28 left-1/2 w-[min(30rem,86%)] -translate-x-1/2 rounded-md bg-pitch-950/65 px-3 py-2 text-center text-xs text-chalk backdrop-blur-sm'
      }
    >
      {t(`hints.${step}`)}
    </p>
  );
}
