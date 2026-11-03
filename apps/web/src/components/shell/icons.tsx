import type { ReactNode } from 'react';

export type IconName =
  | 'home'
  | 'solo'
  | 'online'
  | 'squads'
  | 'transfers'
  | 'store'
  | 'club'
  | 'more'
  | 'credits'
  | 'record'
  | 'clock'
  | 'check'
  | 'play';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />,
  solo: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="m12 8 3.5 2.5-1.3 4h-4.4l-1.3-4zM12 4v4m3.5 2.5 4-1M14.2 14.5l2.3 3.5m-6.7-3.5L7.5 18m1-7.5-4-1" />
    </>
  ),
  online: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16M12 4c2.5 2.4 3.5 5 3.5 8s-1 5.6-3.5 8c-2.5-2.4-3.5-5-3.5-8s1-5.6 3.5-8" />
    </>
  ),
  squads: <path d="m8 4-4 3 2 4 2-1v10h8V10l2 1 2-4-4-3c-.5 1.5-2 2.5-4 2.5S8.5 5.5 8 4" />,
  transfers: <path d="M4 8h13l-3-3m6 11H7l3 3" />,
  store: <path d="M5 8h14l-1 12H6zm4 0V6a3 3 0 0 1 6 0v2" />,
  club: <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18" cy="12" r="1.2" />
    </>
  ),
  credits: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M14.5 9.2A3.5 3.5 0 1 0 14.5 14.8" />
    </>
  ),
  record: (
    <path d="M8 4h8v5a4 4 0 0 1-8 0zm0 2H5v1a3 3 0 0 0 3 3m8-4h3v1a3 3 0 0 1-3 3m-4 3v4m-3 3h6" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  play: <path d="M8 5v14l11-7z" />,
};

/** A line icon of the game shell, drawn in the current colour. Decorative. */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
