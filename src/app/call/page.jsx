import { Suspense } from 'react';
import { PrivateRoute } from '@/components/PrivateRoute';
import CallScreenPage from '@/views/CallScreenPage';

export default function Call() {
  return (
    <PrivateRoute>
      <Suspense fallback={<div className="p-8 text-center text-slate-600">Loading…</div>}>
        <CallScreenPage />
      </Suspense>
    </PrivateRoute>
  );
}
