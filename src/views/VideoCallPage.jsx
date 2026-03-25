'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { useVideoCall } from '../hooks/useVideoCall';
import { motion } from 'framer-motion';
import { Copy, Mic, MicOff, PhoneOff, Sparkles, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMainHeader } from '@/components/AppMainHeader';

function randomRoomId() {
  return `room-${Math.random().toString(36).slice(2, 10)}`;
}

export default function VideoCallPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialRoom = searchParams.get('room') || '';
  const [roomInput, setRoomInput] = useState(initialRoom);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const r = searchParams.get('room');
    if (r) setRoomInput(r);
  }, [searchParams]);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  const {
    localStream,
    remoteStream,
    status,
    error,
    micOn,
    camOn,
    joinCall,
    leaveCall,
    toggleMic,
    toggleCam
  } = useVideoCall({
    userId: user?.id,
    roomId: roomInput
  });

  const leaveRef = useRef(leaveCall);
  leaveRef.current = leaveCall;

  useEffect(() => {
    return () => leaveRef.current();
  }, []);

  useEffect(() => {
    const el = localVideoRef.current;
    if (el && localStream) {
      el.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    const el = remoteVideoRef.current;
    if (el && remoteStream) {
      el.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const syncUrlRoom = () => {
    const r = roomInput.trim();
    const q = new URLSearchParams();
    if (r) q.set('room', r);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const handleJoin = async () => {
    syncUrlRoom();
    await joinCall();
  };

  const handleLeave = () => {
    leaveCall();
  };

  const copyRoomLink = async () => {
    const r = roomInput.trim();
    if (!r) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(r)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  const inCall = ['joining', 'waiting', 'calling', 'connected'].includes(status);

  return (
    <div className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <AppMainHeader />

      <motion.div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-3 pb-3 pt-3 sm:gap-4 sm:px-5"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-100/80 to-yellow-50/60 px-3 py-2.5 dark:border-navy-700/40 dark:from-navy-900/40 dark:to-navy-950/50 sm:px-4 sm:py-3">
          <div className="flex min-w-0 flex-1 gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400 sm:h-5 sm:w-5" />
            <div className="min-w-0">
              <div className="badge mb-1 inline-block">Video call</div>
              <h1 className="text-base font-bold text-amber-950 dark:text-slate-50 sm:text-lg">WebRTC video (1:1)</h1>
              <p className="mt-1 text-xs text-amber-900/90 dark:text-slate-100/85 sm:text-sm">
                Share the same <span className="font-semibold">room ID</span> with one other logged-in user. Both need camera
                access.
              </p>
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/90 text-amber-700 dark:border-navy-600/50 dark:bg-navy-900/60 dark:text-slate-300">
            <Video className="h-5 w-5" />
          </div>
        </div>

        <div className="card flex shrink-0 flex-col gap-3 p-3 sm:flex-row sm:items-end sm:p-4">
          <div className="min-w-0 flex-1">
            <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Room ID
            </label>
            <input
              className="input mt-1"
              placeholder="e.g. team-sync-01"
              value={roomInput}
              disabled={inCall}
              onChange={(e) => setRoomInput(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setRoomInput(randomRoomId())} disabled={inCall}>
              New ID
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={copyRoomLink} disabled={!roomInput.trim()}>
              <Copy className="mr-1.5 h-4 w-4" />
              {copied ? 'Copied' : 'Copy link'}
            </Button>
            {!inCall ? (
              <Button type="button" size="sm" onClick={handleJoin} disabled={!roomInput.trim() || !user?.id}>
                <Video className="mr-1.5 h-4 w-4" />
                {status === 'peer_left' ? 'Join again' : 'Join & start camera'}
              </Button>
            ) : (
              <Button type="button" variant="destructive" size="sm" onClick={handleLeave}>
                <PhoneOff className="mr-1.5 h-4 w-4" />
                Leave
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="shrink-0 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-800 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="shrink-0 rounded-xl border border-amber-200/70 bg-amber-50/80 px-4 py-2 text-sm text-amber-900 dark:border-navy-700/50 dark:bg-navy-950/60 dark:text-slate-200/90">
          Status:{' '}
          <span className="font-medium text-amber-950 dark:text-slate-50">
            {status === 'idle' && 'Ready'}
            {status === 'joining' && 'Getting camera…'}
            {status === 'waiting' && 'Waiting for peer…'}
            {status === 'calling' && 'Connecting…'}
            {status === 'connected' && 'Connected'}
            {status === 'peer_left' && 'Peer left'}
            {status === 'error' && 'Error'}
          </span>
        </div>

        <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-2xl border border-amber-200/60 bg-slate-900 shadow-xl dark:border-navy-800/40">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
          {!remoteStream && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/85 text-center text-amber-100/90">
              <p className="max-w-sm px-4 text-sm">
                Remote video appears here. Open this page in a second browser (or incognito), log in as another user, and
                use the same room ID.
              </p>
            </div>
          )}

          <div className="absolute bottom-3 right-3 w-[28%] min-w-[120px] max-w-[200px] overflow-hidden rounded-xl border-2 border-white/20 shadow-lg">
            <video ref={localVideoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" />
          </div>
        </div>

        {inCall && (
          <div className="flex shrink-0 flex-wrap justify-center gap-2 pb-1">
            <Button type="button" variant="secondary" onClick={toggleMic}>
              {micOn ? <Mic className="mr-2 h-4 w-4" /> : <MicOff className="mr-2 h-4 w-4" />}
              {micOn ? 'Mute' : 'Unmute'}
            </Button>
            <Button type="button" variant="secondary" onClick={toggleCam}>
              {camOn ? <Video className="mr-2 h-4 w-4" /> : <VideoOff className="mr-2 h-4 w-4" />}
              {camOn ? 'Camera off' : 'Camera on'}
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

