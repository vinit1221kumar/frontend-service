'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  listGroupMessages,
  sendGroupMessage as sendFirebaseGroupMessage,
  subscribeGroupMessages
} from '../services/firebaseChat';
import { motion } from 'framer-motion';
import { MessageSquare, Search, Send, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMainHeader } from '@/components/AppMainHeader';

export default function GroupChatPage() {
  const { user } = useAuth();
  const [groupId, setGroupId] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const groupSearchWrapRef = useRef(null);

  useEffect(() => {
    if (!groupSearchOpen) return;
    const onDoc = (e) => {
      if (groupSearchWrapRef.current && !groupSearchWrapRef.current.contains(e.target)) setGroupSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [groupSearchOpen]);

  useEffect(() => {
    if (!groupId.trim()) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const seen = new Set();
    let unsubscribe = () => undefined;

    (async () => {
      try {
        const history = await listGroupMessages(groupId.trim());
        if (cancelled) return;
        history.forEach((item) => seen.add(item._id));
        setMessages(history);
        unsubscribe = subscribeGroupMessages(groupId.trim(), (msg) => {
          if (seen.has(msg._id)) return;
          seen.add(msg._id);
          setMessages((prev) => [...prev, msg]);
        });
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [groupId]);

  const handleSendGroupMessage = async (e) => {
    e.preventDefault();
    if (!user?.id || !groupId.trim() || !message.trim()) return;
    await sendFirebaseGroupMessage({
      groupId: groupId.trim(),
      senderId: user.id,
      message: message.trim()
    });
    setMessage('');
  };

  return (
    <div className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <AppMainHeader />

      <motion.main
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.9, 0.2, 1] }}
      >
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-100/80 to-yellow-50/60 px-3 py-2.5 dark:border-navy-700/40 dark:from-navy-900/40 dark:to-navy-950/50 sm:px-4 sm:py-3">
          <div className="min-w-0 flex-1">
            <div className="badge mb-1 inline-block">Group chat</div>
            <p className="text-xs text-amber-900/90 dark:text-slate-100/90 sm:text-sm">
              Send messages with a <span className="font-semibold">group ID</span>. Try mock:{' '}
              <code className="rounded-md bg-white/70 px-1.5 py-0.5 font-mono text-xs dark:bg-black/30">demo-room</code>.
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/90 text-amber-700 dark:border-navy-600/50 dark:bg-navy-900/60 dark:text-slate-300">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:grid-rows-1 lg:items-stretch lg:gap-5">
        <aside className="card flex max-h-[38vh] min-h-0 flex-col overflow-visible p-0 lg:max-h-none">
          <div
            ref={groupSearchWrapRef}
            className="relative shrink-0 border-b border-amber-200/60 bg-amber-50/50 dark:border-navy-700/40 dark:bg-navy-950/50"
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-amber-950 dark:text-slate-100">
                <Users className="h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400" />
                Group
              </div>
              <Button
                type="button"
                variant={groupSearchOpen ? 'default' : 'secondary'}
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl"
                aria-expanded={groupSearchOpen}
                aria-label="Set group ID"
                onClick={() => setGroupSearchOpen((o) => !o)}
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>
            {groupSearchOpen && (
              <div className="absolute left-4 right-4 top-full z-[60] mt-2 overflow-hidden rounded-2xl border border-amber-200/90 bg-white p-3 shadow-xl dark:border-navy-700/60 dark:bg-navy-950">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-sky-400">
                  Group ID
                </label>
                <input
                  className="input mt-1.5 font-mono text-sm"
                  placeholder="e.g. demo-room"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                />
                <p className="mt-2 text-xs text-amber-800/80 dark:text-slate-300/85">
                  Same ID on multiple accounts for live tests.
                </p>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {groupId.trim() ? (
              <div className="rounded-xl border border-amber-200/70 bg-amber-50/90 px-3 py-2 text-sm font-medium text-amber-950 dark:border-navy-700/50 dark:bg-navy-900/40 dark:text-slate-100">
                <span className="font-mono text-xs">{groupId.trim()}</span>
              </div>
            ) : (
              <p className="text-xs text-amber-800/75 dark:text-sky-400/85">Tap the search icon next to Group to set a group ID.</p>
            )}
          </div>
        </aside>

        <section className="card flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-amber-200/60 px-4 py-3 dark:border-navy-700/40">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400" />
              <div>
                <div className="text-sm font-semibold text-amber-950 dark:text-slate-50">Messages</div>
                <div className="text-xs text-amber-800/70 dark:text-slate-300/80">{messages.length} total</div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-amber-50/20 px-4 py-4 dark:bg-navy-900/25">
            {messages.map((m, idx) => (
              <div
                key={m._id || idx}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400">{m.senderId}</div>
                <div className="mt-1 text-slate-900 dark:text-slate-100">{m.message}</div>
              </div>
            ))}
            {messages.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                No messages yet. Set a groupId and send a message.
              </div>
            )}
          </div>

          <form
            className="flex shrink-0 gap-2 border-t border-amber-200/60 bg-white/80 p-3 dark:border-navy-700/40 dark:bg-navy-950/70"
            onSubmit={handleSendGroupMessage}
          >
            <input
              className="input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message…"
            />
            <Button className="whitespace-nowrap" type="submit" disabled={!groupId || !message}>
              <Send className="mr-2 h-4 w-4" />
              Send
            </Button>
          </form>
        </section>
        </div>
      </motion.main>
    </div>
  );
}

