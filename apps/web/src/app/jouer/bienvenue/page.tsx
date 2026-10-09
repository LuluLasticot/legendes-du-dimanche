import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { PackArt } from '@/components/shell/pack-art';
import { STAGE_PATH, stageOf } from '@/server/game/stage';
import { startAsGuest } from '../actions';
import { currentPlayer } from '../current';

export default async function WelcomePage() {
  const stage = stageOf(await currentPlayer());
  if (stage !== 'start') redirect(STAGE_PATH[stage]);
  const t = await getTranslations('game.welcome');

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-10 px-4 py-12 md:flex-row md:gap-16">
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 m-auto size-56 rounded-full bg-pitch-500/30 blur-3xl"
        />
        <PackArt
          type="starter"
          uid="welcome-pack"
          className="relative h-64 w-auto -rotate-6 drop-shadow-[0_18px_28px_rgb(0_0_0/0.7)] sm:h-80"
        />
      </div>
      <div className="flex max-w-md flex-col items-center gap-5 text-center md:items-start md:text-left">
        <h1 className="font-display text-5xl leading-none font-extrabold text-chalk uppercase sm:text-6xl">
          {t('title')}
        </h1>
        <p className="text-lg text-chalk-muted">{t('pitch')}</p>
        <form action={startAsGuest}>
          <button
            type="submit"
            className="rounded-md bg-floodlight-400 px-6 py-3 font-display text-2xl leading-none font-extrabold tracking-wide text-pitch-950 uppercase shadow-floodlight hover:bg-floodlight-300"
          >
            {t('start')}
          </button>
        </form>
        <p className="text-xs text-chalk-faint">{t('guest')}</p>
      </div>
    </main>
  );
}
