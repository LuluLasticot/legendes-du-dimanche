import type { ReactNode } from 'react';

/**
 * A big tile of a game page: a kicker (the mode it belongs to), a title, a picture or content,
 * and an optional call to action. The whole tile is the target, as on a console menu.
 */
export function Tile({
  kicker,
  title,
  children,
  action,
  className = '',
  tone = 'plain',
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** `hero`: the page's main tile; `muted`: a mode that is not open yet. */
  tone?: 'plain' | 'hero' | 'muted';
}) {
  const ring =
    tone === 'hero'
      ? 'ring-floodlight-400/40 hover:ring-floodlight-400'
      : tone === 'muted'
        ? 'ring-chalk/6'
        : 'ring-chalk/10 hover:ring-floodlight-400/70';
  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-lg bg-pitch-900/85 shadow-card ring-1 transition duration-200 hover:-translate-y-0.5 ${ring} ${className}`}
    >
      <header className="relative z-10 px-4 pt-3.5 sm:px-5 sm:pt-4">
        <p className="text-[11px] font-bold tracking-[0.18em] text-floodlight-400 uppercase">
          {kicker}
        </p>
        <h2
          className={`font-display leading-none font-extrabold text-chalk uppercase ${
            tone === 'hero' ? 'mt-1 text-4xl sm:text-5xl' : 'mt-0.5 text-2xl'
          }`}
        >
          {title}
        </h2>
      </header>
      <div className="relative flex flex-1 flex-col">{children}</div>
      {action && <footer className="relative z-10 px-4 pb-4 sm:px-5 sm:pb-5">{action}</footer>}
    </article>
  );
}

/** The yellow button of a tile. */
export function TileButton({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-floodlight-400 px-4 py-2 font-display text-lg leading-none font-extrabold tracking-wide text-pitch-950 uppercase shadow-floodlight transition group-hover:bg-floodlight-300">
      {children}
    </span>
  );
}
