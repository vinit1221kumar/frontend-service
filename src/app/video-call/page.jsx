import { Suspense } from 'react';
import { PrivateRoute } from '@/components/PrivateRoute';
import VideoCallPage from '@/views/VideoCallPage';

export default function VideoCall() {
  return (
    <PrivateRoute>
      <Suspense fallback={<div className="p-8 text-center text-slate-600">Loading…</div>}>
        <VideoCallPage />
      </Suspense>
    </PrivateRoute>
  );
}
