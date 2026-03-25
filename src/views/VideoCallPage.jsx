'use client';

import { AppMainHeader } from '@/components/AppMainHeader';
import CallUI from '@/components/CallUI';

export default function VideoCallPage() {
  return (
    <div className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <AppMainHeader />
      <main className="flex min-h-0 flex-1 overflow-y-auto">
        <CallUI
          defaultMode="video"
          title="Video calls"
          description="Start a direct 1:1 video call with another signed-in user. Both sides use the same accept or reject flow."
          theme="enhanced"
        />
      </main>
    </div>
  );
}
