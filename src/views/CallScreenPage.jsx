'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { endVoiceCallSession, startVoiceCallSession } from '../services/firebaseChat';
import { motion } from 'framer-motion';
import { Phone, PhoneCall, PhoneOff, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMainHeader } from '@/components/AppMainHeader';

export default function CallScreenPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [calleeId, setCalleeId] = useState('');
  const [callId, setCallId] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const c = searchParams.get('callee');
    if (c) setCalleeId(c);
  }, [searchParams]);

  const startCall = async (e) => {
    e.preventDefault();
    if (!user?.id || !calleeId.trim()) return;
    const id = await startVoiceCallSession({
      callerId: user.id,
      calleeId: calleeId.trim()
    });
    setCallId(id);
    setStatus('In call');
  };

  const endCall = async () => {
    if (!callId) return;
    await endVoiceCallSession(callId);
    setStatus('Call ended');
  };

  return (
    <div className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <AppMainHeader />

      <motion.main
        className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.9, 0.2, 1] }}
      >
        <div className="anim-fade-up mb-4 flex shrink-0 items-start justify-between gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-100/80 to-yellow-50/60 px-3 py-2.5 dark:border-navy-700/40 dark:from-navy-900/40 dark:to-navy-950/50 sm:px-4 sm:py-3">
          <div className="flex min-w-0 flex-1 gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400 sm:h-5 sm:w-5" />
            <div className="min-w-0">
              <div className="badge mb-1 inline-block">Video call</div>
              <p className="text-xs text-amber-900/90 dark:text-slate-100/90 sm:text-sm">
                Start a voice session via Firebase Realtime Database call records.
              </p>
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/90 text-amber-700 dark:border-navy-600/50 dark:bg-navy-900/60 dark:text-slate-300">
            <Phone className="h-5 w-5" />
          </div>
        </div>

        <motion.div
          className="card anim-fade-up mx-auto w-full max-w-lg p-6 [animation-delay:70ms] sm:my-auto sm:p-7"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.2, 0.9, 0.2, 1] }}
        >
          <div className="mb-5">
            <h1 className="text-xl font-bold tracking-tight text-amber-950 dark:text-slate-50">Start a video call</h1>
            <p className="mt-1 text-sm text-amber-800/85 dark:text-slate-200/75">
              Enter a callee user ID to create a call session and share the room from the video page.
            </p>
          </div>
          <form onSubmit={startCall} className="flex flex-col gap-3 sm:flex-row">
            <input
              className="input"
              placeholder="Callee ID"
              value={calleeId}
              onChange={(e) => setCalleeId(e.target.value)}
            />
            <Button className="sm:w-40" type="submit" disabled={!calleeId}>
              <PhoneCall className="mr-2 h-4 w-4" />
              Start call
            </Button>
          </form>

          {(callId || status) && (
            <div className="mt-5 space-y-2">
              {callId && (
                <div className="anim-fade-up rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm [animation-delay:120ms] dark:border-navy-700/50 dark:bg-navy-950/50">
                  <div className="text-xs text-amber-700 dark:text-sky-400">Call ID</div>
                  <div className="mt-1 font-mono text-amber-950 dark:text-slate-50">{callId}</div>
                </div>
              )}
              {status && (
                <div className="anim-fade-up text-sm text-amber-800 [animation-delay:140ms] dark:text-slate-200">Status: {status}</div>
              )}

              <Button variant="secondary" onClick={endCall} disabled={!callId}>
                <PhoneOff className="mr-2 h-4 w-4" />
                End call
              </Button>
            </div>
          )}
        </motion.div>
      </motion.main>
    </div>
  );
}
