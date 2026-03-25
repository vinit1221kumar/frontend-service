'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return children;
}
