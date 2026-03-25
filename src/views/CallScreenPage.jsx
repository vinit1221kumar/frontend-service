'use client';

import { AppMainHeader } from '@/components/AppMainHeader';
import CallUI from '@/components/CallUI';

export default function CallScreenPage() {
  return (
    <div className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <AppMainHeader />
      <main className="flex min-h-0 flex-1 overflow-y-auto">
        <CallUI
          defaultMode="audio"
          title="Voice and video calls"
          description="Start a direct call with another signed-in user and choose audio or video on the same page."
          theme="enhanced"
        />
      </main>
    </div>
  );
}
