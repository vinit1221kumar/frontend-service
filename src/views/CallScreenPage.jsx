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
          title="Voice calls"
          description="Start a direct voice call with another signed-in user. The receiver can answer from this page."
          theme="enhanced"
        />
      </main>
    </div>
  );
}
