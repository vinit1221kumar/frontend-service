'use client';

import { useTheme } from '@/context/ThemeContext';

/** Light theme illustration */
export const AUTH_BG_LIGHT = '/images/login-bg.png';
/** Dark / navy “blue” theme */
export const AUTH_BG_DARK_BLUE = '/images/login_blue.png';

/**
 * Auth backgrounds: image **covers the whole viewport** (`bg-cover` = fill screen, same on light + dark).
 * Slight gradient only for readability; base tint keeps the warm yellow / navy theme.
 */
export function AuthPageBackground() {
  const { resolved } = useTheme();
  const isDark = resolved === 'dark';
  const bgUrl = isDark ? AUTH_BG_DARK_BLUE : AUTH_BG_LIGHT;

  return (
    <>
      {/* Theme tint behind the photo (fills any edge if asset is extreme aspect) */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 min-h-[100dvh] w-full bg-gradient-to-br from-amber-50 via-amber-100 to-yellow-50 dark:from-navy-950 dark:via-navy-900 dark:to-slate-950"
        aria-hidden
      />
      {/* Full-screen image: cover = stretch to fill viewport (like wallpaper) */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 min-h-[100dvh] w-full bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('${bgUrl}')` }}
        aria-hidden
      />
      {/* Thin veil so the card stays readable; kept light so yellow art stays visible */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 min-h-[100dvh] w-full bg-gradient-to-b from-amber-50/20 via-transparent to-amber-50/35 dark:from-navy-950/30 dark:via-transparent dark:to-navy-950/50"
        aria-hidden
      />
    </>
  );
}
