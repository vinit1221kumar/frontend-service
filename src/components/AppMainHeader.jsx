'use client';

import { AppHeaderMenu } from '@/components/AppHeaderMenu';
import { AppNavIcons } from '@/components/AppNavIcons';
import { ProfileMenu } from '@/components/ProfileMenu';

/**
 * Shared shell header: avatar + username, labeled nav panel, theme/home/⋮ menu (same as dashboard).
 */
export function AppMainHeader() {
  return (
    <header className="z-20 shrink-0 border-b border-amber-200/60 bg-white/75 backdrop-blur-xl dark:border-navy-800/40 dark:bg-navy-950/80">
      <div className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5 sm:py-3">
        <ProfileMenu />

        <div className="min-w-0 flex-1">
          <div className="card flex min-h-0 w-full items-center justify-center border-amber-200/80 bg-white/85 px-1.5 py-2 shadow-sm dark:border-navy-700/50 dark:bg-navy-950/70 sm:px-3">
            <AppNavIcons showLabels className="w-full max-w-2xl justify-center" />
          </div>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <AppHeaderMenu menuLinks={[]} />
        </div>
      </div>
    </header>
  );
}
