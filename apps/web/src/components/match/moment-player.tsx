'use client';

import type { GesturePoint } from '@legendes/engine/moments';
import type { sim } from '@legendes/engine';
import type { SandboxHandle, SandboxStep } from '@legendes/render3d';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { GestureTrace, PowerGauge, StepHint } from '@/components/lab/moment-ui';
import { publicEnv } from '@/env';
import { momentLooks } from './moment-looks';

interface Props {
  setup: sim.MatchSetup;
  request: sim.MomentRequest;
  conditions: sim.MatchConditions;
  /** The moment's outcome, played by the player or left to the coach. */
  onDone: (outcome: sim.ShotOutcome) => void;
  /** Resolves the moment by the stats alone (the "let the coach play" button). */
  onAuto: () => void;
}

/**
 * A key moment of the match in 3D (GDD §7.4): mounts the situation for this request, shows
 * the hint of the step, the gauge and the finger trace, and hands the outcome back.
 */
export function MomentPlayer({ setup, request, conditions, onDone, onAuto }: Props) {
  const t = useTranslations('match');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  const [trace, setTrace] = useState<readonly GesturePoint[] | null>(null);
  const [aspect, setAspect] = useState(1);
  const [step, setStep] = useState<SandboxStep | null>(null);
  const [gauge, setGauge] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: SandboxHandle | null = null;
    const observer = new ResizeObserver(() =>
      setAspect(canvas.clientWidth / Math.max(1, canvas.clientHeight)),
    );
    observer.observe(canvas);
    void import('@legendes/render3d')
      .then(async (render3d) => {
        // The clubs' kits; plain colours if the prints cannot be drawn (the moment still plays).
        const looks = await momentLooks(render3d, setup, request).catch((error: unknown) => {
          console.error(error);
          return undefined;
        });
        if (cancelled) return;
        handle = render3d.mountBallSandbox(
          canvas,
          render3d.settingsForMoment(request, conditions),
          {
            quality: render3d.qualityFromQuery(window.location.search) ?? 'auto',
            characterAssetsUrl:
              publicEnv.NEXT_PUBLIC_CHARACTER_ASSETS_URL ?? '/api/assets/characters/',
            moment: { onOutcome: (result) => doneRef.current(result.outcome) },
            ...(looks ? { looks } : {}),
          },
        );
        handle.onGesture((points) => setTrace(points ? [...points] : null));
        handle.onStep(setStep);
        handle.onGauge(setGauge);
      })
      .catch((error: unknown) => {
        console.error(error);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      observer.disconnect();
      handle?.dispose();
    };
  }, [setup, request, conditions]);

  return (
    <div className="absolute inset-0 z-10 bg-pitch-950 select-none">
      <canvas ref={canvasRef} className="block size-full touch-none" />
      <GestureTrace trace={trace} aspect={aspect} />
      <PowerGauge value={gauge} />
      <StepHint
        step={step}
        className="pointer-events-none absolute bottom-24 left-1/2 w-[min(30rem,86%)] -translate-x-1/2 rounded-md bg-pitch-950/70 px-3 py-2 text-center text-xs text-chalk backdrop-blur-sm"
      />
      <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-md bg-floodlight-400 px-4 py-1.5 text-sm font-semibold text-pitch-950">
        {t(`moment.${request.kind}`, { player: request.shooter.name })}
      </div>
      <button
        type="button"
        onClick={onAuto}
        className="absolute right-3 bottom-4 rounded-pill border border-chalk/20 bg-pitch-900/80 px-3 py-1.5 text-xs font-semibold text-chalk backdrop-blur-sm hover:bg-pitch-800"
      >
        {t('moment.auto')}
      </button>
      {failed && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-chalk">
          {t('webglError')}{' '}
          <button type="button" onClick={onAuto} className="ml-2 underline">
            {t('moment.auto')}
          </button>
        </p>
      )}
    </div>
  );
}
