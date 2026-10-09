import type { ReactNode } from 'react';
import { NightBackdrop } from '@/components/shell/night-backdrop';

/** The welcome: the game's night, without its bar and tabs (they come after the starter pack). */
export default function WelcomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden bg-pitch-950">
      <NightBackdrop />
      <div className="relative z-10 flex min-h-dvh flex-1 flex-col">{children}</div>
    </div>
  );
}
