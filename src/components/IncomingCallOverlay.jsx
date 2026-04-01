'use client';

import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useIncomingCall } from '@/context/IncomingCallContext';

export default function IncomingCallOverlay() {
  const { offer, callerProfile, accept, reject } = useIncomingCall() || {};
  const pathname = usePathname();
  const isOnCallPage = pathname?.startsWith('/call') || pathname?.startsWith('/webrtc-call');

  if (!offer || isOnCallPage) return null;

  const callerName = callerProfile?.username || (offer.fromUserId?.slice(0, 8) + '…') || 'Unknown';
  const isVideo = offer.mode === 'video';
  const initial = callerName.slice(0, 1).toUpperCase();

  return (
    <AnimatePresence>
      <motion.div
        key="incoming-call-overlay"
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="flex flex-col items-center gap-10 px-8 py-14 text-center"
          initial={{ scale: 0.88, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        >
          {/* Avatar with pulse rings */}
          <div className="relative flex items-center justify-center">
            <span className="absolute h-36 w-36 animate-ping rounded-full bg-green-500/20" />
            <span className="absolute h-48 w-48 animate-ping rounded-full bg-green-500/10 [animation-delay:400ms]" />
            <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-amber-600 text-5xl font-bold text-white shadow-2xl shadow-amber-500/30">
              {initial}
            </div>
          </div>

          {/* Caller info */}
          <div>
            <p className="text-2xl font-bold tracking-tight text-white">{callerName}</p>
            <p className="mt-2 animate-pulse text-sm font-medium text-white/65">
              {isVideo ? 'Incoming video call…' : 'Incoming voice call…'}
            </p>
          </div>

          {/* Accept / Decline */}
          <div className="flex gap-16">
            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={reject}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-xl shadow-red-500/40 transition-transform hover:bg-red-600 active:scale-90"
                aria-label="Decline call"
              >
                <PhoneOff className="h-7 w-7" />
              </button>
              <span className="text-sm font-medium text-white/70">Decline</span>
            </div>

            <div className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={accept}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-xl shadow-green-500/40 transition-transform hover:bg-green-600 active:scale-90"
                aria-label="Accept call"
              >
                {isVideo ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
              </button>
              <span className="text-sm font-medium text-white/70">Accept</span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
