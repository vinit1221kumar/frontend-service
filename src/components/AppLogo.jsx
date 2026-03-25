'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';

/** Dark / blue UI — full-colour logo */
export const LOGO_PATH = '/images/logo.png';
/** Light / yellow UI — white logo (same frames as blue theme below) */
export const LOGO_PATH_LIGHT = '/images/logo_white.png';

/** Navy chip — dark theme; circular frame + inner padding so curved edge clearly shows */
const logoChipMark =
  'box-border flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-navy-600/40 bg-gradient-to-br from-sky-500/35 to-yellow-600/25 p-1.5 shadow-[0_0_0_1px_rgba(56,189,248,0.12)_inset]';
const logoChipFooter =
  'box-border flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-navy-600/40 bg-gradient-to-br from-sky-500/35 to-yellow-600/25 p-1 shadow-[0_0_0_1px_rgba(56,189,248,0.12)_inset]';
/**
 * Light / yellow theme — same idea: full round frame + padding so curves read on the image
 */
const logoChipMarkLight =
  'box-border flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-200/80 bg-gradient-to-br from-amber-400/35 to-yellow-300/30 p-1.5 shadow-sm';
const logoChipFooterLight =
  'box-border flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-amber-200/80 bg-gradient-to-br from-amber-400/35 to-yellow-300/30 p-1 shadow-sm';

/**
 * Fill each slot and crop extras (`object-cover`) so the yellow/coloured mark dominates — no empty letterboxing.
 * Tune focal point if your asset’s art isn’t centred: pass `imgClassName="object-[50%_40%]"` etc.
 */
/** Image clips to the round frame (curves visible, not a sharp square PNG over the circle) */
const logoImgCover = 'object-cover object-center rounded-full';

function FallbackMark({ className, small }) {
  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full border border-amber-200/80 bg-gradient-to-br from-amber-400/35 to-yellow-300/30 text-sm font-bold text-amber-950 shadow-sm dark:border-navy-600/40 dark:from-sky-500/35 dark:to-yellow-600/25 dark:text-slate-50 dark:shadow-[0_0_0_1px_rgba(56,189,248,0.12)_inset]',
        small ? 'h-9 w-9' : 'h-10 w-10',
        className
      )}
    >
      D
    </div>
  );
}

/**
 * @param {'mark' | 'footer' | 'badge'} variant
 * - mark: header icon (square)
 * - footer: footer row (slightly smaller)
 * - badge: login/register card top — full wordmark visible (`object-contain`, no crop)
 */
export function AppLogo({ variant = 'mark', className, imgClassName }) {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const logoSrc = isDark ? LOGO_PATH : LOGO_PATH_LIGHT;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoSrc]);

  if (failed) {
    if (variant === 'badge') {
      return (
        <div className={cn('badge mb-3 w-fit', className)}>
          <span className="font-semibold">D-Lite</span>
        </div>
      );
    }
    return <FallbackMark className={className} small={variant === 'footer'} />;
  }

  if (variant === 'badge') {
    const img = (
      <Image
        src={logoSrc}
        alt="D-Lite"
        width={512}
        height={512}
        loading="eager"
        fetchPriority="high"
        decoding="async"
        className={cn(
          'block h-16 w-auto max-h-40 min-h-[4rem] max-w-full object-contain object-left sm:h-20 sm:max-h-44 md:h-24',
          'sm:max-w-[min(320px,100%)]',
          imgClassName
        )}
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
    return (
      <div className={cn('mb-4 flex w-full justify-start', className)}>
        {isDark ? (
          img
        ) : (
          <div className="inline-flex max-w-full rounded-2xl border border-amber-200/75 bg-gradient-to-br from-amber-50/95 to-yellow-50/90 px-4 py-3 shadow-sm ring-1 ring-amber-200/45">
            {img}
          </div>
        )}
      </div>
    );
  }

  const wrap = (() => {
    if (variant === 'footer') return isDark ? logoChipFooter : logoChipFooterLight;
    return isDark ? logoChipMark : logoChipMarkLight;
  })();

  return (
    <div className={cn(wrap, className)}>
      <Image
        src={logoSrc}
        alt="D-Lite"
        width={64}
        height={64}
        className={cn('h-full w-full min-h-0 min-w-0', logoImgCover, imgClassName)}
        draggable={false}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
