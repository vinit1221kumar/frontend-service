'use client';

import { AppBrandRow } from '@/components/AppBrandRow';

/**
 * Login / Register — same brand row as landing header: round logo + “D-Lite” + tagline (theme-aware).
 */
export function AuthCardBranding({ className = '' }) {
  return <AppBrandRow asHomeLink className={className} />;
}
