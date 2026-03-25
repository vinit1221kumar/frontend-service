'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/AppLogo';

/**
 * Same brand row as the home / landing header: round logo + title + tagline (both themes).
 */
export function AppBrandRow({ className, asHomeLink = false }) {
  const inner = (
    <>
      <AppLogo variant="mark" />
      <div>
        <div className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">D-Lite</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">Chat • Groups • Calls</div>
      </div>
    </>
  );

  if (asHomeLink) {
    return (
      <Link href="/" className={cn('flex items-center gap-3 no-underline hover:opacity-90', className)}>
        {inner}
      </Link>
    );
  }

  return <div className={cn('flex items-center gap-3', className)}>{inner}</div>;
}
