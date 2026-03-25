'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatPeerPresence } from '@/lib/formatPresence';
import { cn } from '@/lib/utils';
import { useAuth } from '../hooks/useAuth';
import {
  deleteDirectMessage,
  editDirectMessage,
  listDirectMessages,
  markRecentDirectChatRead,
  searchUsersByUsername,
  sendDirectMessage,
  subscribeDirectMessages,
  subscribeRecentDirectChats,
  subscribeUserPresence
} from '../services/firebaseChat';
import { motion } from 'framer-motion';
import {
  Loader2,
  MessageCircle,
  Phone,
  MoreVertical,
  Pencil,
  Search,
  Send,
  Sparkles,
  Trash2,
  Video,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMainHeader } from '@/components/AppMainHeader';

export default function ChatDashboardPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageLoadError, setMessageLoadError] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [input, setInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionError, setActionError] = useState('');
  const [activeUserId, setActiveUserId] = useState('');
  const [peerUsername, setPeerUsername] = useState('');
  const [recentChats, setRecentChats] = useState([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentLoadError, setRecentLoadError] = useState('');
  const [recentRefreshTick, setRecentRefreshTick] = useState(0);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [peerPresence, setPeerPresence] = useState(null);
  const [peerPresenceLoading, setPeerPresenceLoading] = useState(false);
  const [peerAvatarFailed, setPeerAvatarFailed] = useState(false);
  const [openMessageMenuId, setOpenMessageMenuId] = useState(null);
  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  const searchWrapRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      const target = e.target;
      if (target?.closest?.('[data-message-menu]')) return;
      setOpenMessageMenuId(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onDoc = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [searchOpen]);

  useEffect(() => {
    if (!user?.id || !searchOpen) return;
    let cancelled = false;
    const handle = async () => {
      setSearchLoading(true);
      try {
        const users = await searchUsersByUsername(searchQuery, user.id);
        if (!cancelled) setSearchResults(users);
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    };
    const t = setTimeout(handle, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [user?.id, searchOpen, searchQuery]);

  const pickPeer = (id, username) => {
    setActiveUserId(id);
    setPeerUsername(username);
    setActionError('');
    setSearchOpen(false);
    setSearchQuery('');
  };

  const clearPeer = () => {
    setActiveUserId('');
    setPeerUsername('');
    setPeerPresence(null);
    setPeerAvatarFailed(false);
  };

  useEffect(() => {
    setPeerAvatarFailed(false);
  }, [activeUserId]);

  useEffect(() => {
    if (!activeUserId.trim()) {
      setPeerPresence(null);
      return;
    }
    setPeerPresenceLoading(true);
    const unsubscribe = subscribeUserPresence(activeUserId.trim(), (presence) => {
      setPeerPresence(presence);
      setPeerPresenceLoading(false);
    });
    return () => {
      unsubscribe();
      setPeerPresenceLoading(false);
    };
  }, [activeUserId]);

  useEffect(() => {
    if (!user?.id) {
      setRecentChats([]);
      setRecentLoadError('');
      return;
    }

    setRecentLoading(true);
    setRecentLoadError('');
    let unsubscribe = () => undefined;

    try {
      unsubscribe = subscribeRecentDirectChats(user.id, (items) => {
        setRecentChats(items);
        setRecentLoadError('');
        setRecentLoading(false);
      });
    } catch {
      setRecentLoadError('Could not load recent chats.');
      setRecentLoading(false);
    }

    return () => {
      unsubscribe();
    };
  }, [user?.id, recentRefreshTick]);

  useEffect(() => {
    if (!user?.id || !activeUserId.trim()) {
      setMessages([]);
      setMessagesLoading(false);
      setMessageLoadError('');
      return;
    }

    markRecentDirectChatRead(user.id, activeUserId.trim()).catch(() => undefined);
    setMessagesLoading(true);
    setMessageLoadError('');

    let cancelled = false;
    const seen = new Set();
    let unsubscribe = () => undefined;

    (async () => {
      try {
        const history = await listDirectMessages(user.id, activeUserId.trim());
        if (cancelled) return;
        history.forEach((msg) => seen.add(msg._id));
        setMessages(history);
        setMessagesLoading(false);
        unsubscribe = subscribeDirectMessages(user.id, activeUserId.trim(), (msg) => {
          if (seen.has(msg._id)) return;
          seen.add(msg._id);
          setMessages((prev) => [...prev, msg]);
          if (msg.senderId && msg.senderId !== user.id) {
            markRecentDirectChatRead(user.id, activeUserId.trim()).catch(() => undefined);
          }
        });
      } catch {
        if (!cancelled) {
          setMessageLoadError('Could not load messages.');
          setMessagesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user?.id, activeUserId, historyRefreshTick]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!user?.id || !activeUserId || !input.trim()) return;
    setSendingMessage(true);
    setActionError('');
    try {
      await sendDirectMessage({
        senderId: user.id,
        receiverId: activeUserId.trim(),
        content: input.trim()
      });
      setInput('');
    } catch {
      setActionError('Could not send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const sendQuickMessage = async (content) => {
    if (!user?.id || !activeUserId?.trim()) return;
    const text = String(content || '').trim();
    if (!text) return;
    setSendingMessage(true);
    setActionError('');
    try {
      await sendDirectMessage({
        senderId: user.id,
        receiverId: activeUserId.trim(),
        content: text
      });
      setInput('');
    } catch {
      setActionError('Could not send message. Please try again.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleEditMessage = async (message) => {
    if (!user?.id || !activeUserId?.trim() || !message?._id) return;
    const createdAt = Number(message.createdAt || 0);
    const canAccess = createdAt && Date.now() - createdAt <= EDIT_WINDOW_MS;
    if (!canAccess) {
      setActionError('Edit window expired (15 minutes).');
      return;
    }

    const next = window.prompt('Edit message', message.content || '');
    if (next === null) return; // cancelled
    const newContent = next.trim();
    if (!newContent) return;

    setActionError('');
    try {
      await editDirectMessage({
        userId: user.id,
        peerId: activeUserId.trim(),
        messageId: message._id,
        newContent
      });
      setMessages((prev) => prev.map((m) => (m._id === message._id ? { ...m, content: newContent } : m)));
      setOpenMessageMenuId(null);
    } catch (err) {
      setActionError(err?.message || 'Could not edit message. Please try again.');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!messageId || !user?.id || !activeUserId.trim()) return;
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Delete this message? It will also be deleted for the other user.')
    )
      return;
    setDeletingMessageId(messageId);
    setActionError('');
    try {
      await deleteDirectMessage({
        userId: user.id,
        peerId: activeUserId.trim(),
        messageId
      });
      setMessages((prev) => prev.filter((item) => item._id !== messageId));
    } catch {
      setActionError('Could not delete message. Please try again.');
    } finally {
      setDeletingMessageId('');
    }
  };

  const peerShort =
    activeUserId.trim().length > 12
      ? `${activeUserId.trim().slice(0, 6)}…${activeUserId.trim().slice(-4)}`
      : activeUserId.trim() || '—';

  const peerDisplay = peerUsername || (activeUserId.trim() ? peerShort : '');
  const peerInitial = peerUsername
    ? peerUsername.slice(0, 1).toUpperCase()
    : activeUserId.trim()
      ? peerShort.slice(0, 1).toUpperCase()
      : '?';

  const peerAvatarSeed = encodeURIComponent(peerUsername || activeUserId.trim() || 'user');

  return (
    <div className="app-shell flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      <AppMainHeader />

      <motion.main
        className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3 pt-3 sm:px-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0.9, 0.2, 1] }}
      >
        <div className="anim-fade-up mb-3 flex shrink-0 items-start gap-2 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-100/80 to-yellow-50/60 px-3 py-2.5 dark:border-navy-700/40 dark:from-navy-900/40 dark:to-navy-950/50 sm:px-4 sm:py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400 sm:h-5 sm:w-5" />
          <p className="text-xs leading-relaxed text-amber-900/90 dark:text-slate-100/90 sm:text-sm">
            <span className="font-semibold">Direct messages</span> — tap the search icon in Chats, find someone by{' '}
            <span className="font-semibold">username</span>, then message them in real time.
          </p>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:grid-rows-1 lg:items-stretch lg:gap-5">
          {/* Sidebar */}
          <aside className="card anim-fade-up flex max-h-[38vh] min-h-0 flex-col overflow-visible p-0 [animation-delay:70ms] lg:max-h-none lg:min-h-0">
            <div
              ref={searchWrapRef}
              className="relative shrink-0 border-b border-amber-200/60 bg-amber-50/50 dark:border-navy-700/40 dark:bg-navy-950/50"
            >
              <div className="flex items-center justify-between gap-2 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-amber-950 dark:text-slate-100">
                  <MessageCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400" />
                  Chats
                </div>
                <Button
                  type="button"
                  variant={searchOpen ? 'default' : 'secondary'}
                  size="icon"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  aria-expanded={searchOpen}
                  aria-label="Search users"
                  onClick={() => setSearchOpen((o) => !o)}
                >
                  <Search className="h-5 w-5" />
                </Button>
              </div>

              {searchOpen && (
                <div className="anim-pop absolute left-4 right-4 top-full z-[60] mt-2 overflow-hidden rounded-2xl border border-amber-200/90 bg-white shadow-xl dark:border-navy-700/60 dark:bg-navy-950">
                    <div className="border-b border-amber-100 p-2 dark:border-navy-700/50">
                      <input
                        ref={searchInputRef}
                        className="input py-2.5 text-sm"
                        placeholder="Search username…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <div className="max-h-52 overflow-y-auto p-1">
                      {searchLoading ? (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-amber-700 dark:text-slate-300">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      ) : searchResults.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-amber-700/80 dark:text-sky-400/90">
                          No users found.
                        </p>
                      ) : (
                        searchResults.map((u) => (
                          <button
                            key={u.id}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-amber-950 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
                            onClick={() => pickPeer(u.id, u.username)}
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-200/80 text-xs font-bold text-amber-900 dark:bg-navy-800/80 dark:text-slate-100">
                              {(u.username || '?').slice(0, 1).toUpperCase()}
                            </span>
                            <span className="min-w-0 flex-1 truncate">{u.username}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {activeUserId.trim() && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/70 bg-amber-50/90 px-3 py-2 dark:border-navy-700/50 dark:bg-navy-900/40">
                  <span className="truncate text-sm font-semibold text-amber-950 dark:text-slate-100">
                    {peerDisplay}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    aria-label="Clear chat"
                    onClick={clearPeer}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <p className="px-1 text-xs font-semibold uppercase tracking-wide text-amber-800/80 dark:text-slate-300/90">
                  Recent chats
                </p>

                {recentLoadError && (
                  <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-2.5 py-2 text-xs text-red-700 dark:text-red-300">
                    <p>{recentLoadError}</p>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-2 h-7 px-2 text-[11px]"
                      onClick={() => setRecentRefreshTick((value) => value + 1)}
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {recentLoading ? (
                  <div className="flex items-center gap-2 px-2 py-2 text-xs text-amber-700 dark:text-slate-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading…
                  </div>
                ) : recentChats.length === 0 ? (
                  <p className="px-2 py-2 text-xs text-amber-700/80 dark:text-slate-300/80">No recent chats yet.</p>
                ) : (
                  recentChats.map((chat) => (
                    <button
                      key={chat.threadId}
                      type="button"
                      onClick={() => pickPeer(chat.peerId, chat.peerUsername)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-2 text-left transition-colors duration-150',
                        activeUserId.trim() === chat.peerId
                          ? 'border-amber-300/80 bg-amber-100/70 dark:border-navy-600/60 dark:bg-navy-900/50'
                          : 'border-amber-200/70 bg-white/70 hover:bg-amber-50 dark:border-navy-700/50 dark:bg-navy-950/40 dark:hover:bg-navy-900/50'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-amber-950 dark:text-slate-100">{chat.peerUsername}</p>
                        {activeUserId.trim() !== chat.peerId && Number(chat.unreadCount || 0) > 0 && (
                          <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white dark:bg-sky-500">
                            {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-amber-700/90 dark:text-slate-300/90">
                        {chat.lastMessage || 'Message'}
                      </p>
                      {activeUserId.trim() !== chat.peerId && Number(chat.unreadCount || 0) > 0 && (
                        <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-sky-400">
                          {chat.unreadCount} unread {chat.unreadCount === 1 ? 'message' : 'messages'}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* Chat panel — fills remaining viewport */}
          <section className="card anim-fade-up flex min-h-0 flex-1 flex-col overflow-hidden p-0 [animation-delay:130ms] lg:min-h-0">
            <div className="flex flex-col gap-3 border-b border-amber-200/60 bg-gradient-to-r from-white/90 to-amber-50/30 px-4 py-3 dark:border-navy-700/40 dark:from-navy-950/80 dark:to-navy-950/50 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {activeUserId.trim() ? (
                  <>
                    <div className="relative shrink-0">
                      {!peerAvatarFailed ? (
                        <Image
                          src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${peerAvatarSeed}`}
                          alt=""
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-2xl border border-amber-200/70 bg-amber-50 object-cover dark:border-navy-700/50 dark:bg-navy-900/40"
                          onError={() => setPeerAvatarFailed(true)}
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-600 text-lg font-bold text-white shadow-md shadow-violet-500/25 dark:from-violet-600 dark:to-fuchsia-700">
                          {peerInitial}
                        </div>
                      )}
                      {peerPresence?.online ? (
                        <span
                          className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-navy-950"
                          title="Online"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-amber-950 dark:text-slate-50">
                        {peerUsername ? (
                          <span className="text-[15px]">{peerUsername}</span>
                        ) : (
                          <span className="font-mono text-[15px]">{peerShort}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-amber-700/90 dark:text-slate-300/90">
                        {peerPresenceLoading ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading status…
                          </span>
                        ) : (
                          formatPeerPresence(peerPresence?.online, peerPresence?.lastSeen)
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label="Clear chat"
                      onClick={clearPeer}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <p className="text-sm font-semibold text-amber-700/50 dark:text-sky-400/90">Select a chat</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {activeUserId.trim() && user?.id ? (
                  <>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/call?callee=${encodeURIComponent(activeUserId.trim())}&mode=audio`}>
                        <Phone className="mr-1.5 h-4 w-4" />
                        Voice
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/video-call?callee=${encodeURIComponent(activeUserId.trim())}&mode=video`}>
                        <Video className="mr-1.5 h-4 w-4" />
                        Video
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button type="button" size="sm" variant="secondary" disabled title="Choose someone to chat">
                      <Phone className="mr-1.5 h-4 w-4" />
                      Voice
                    </Button>
                    <Button type="button" size="sm" variant="secondary" disabled title="Choose someone to chat">
                      <Video className="mr-1.5 h-4 w-4" />
                      Video
                    </Button>
                  </>
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-amber-50/20 px-3 py-3 dark:bg-navy-900/25 sm:px-4 sm:py-4">
              {messageLoadError && (
                <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  <p>{messageLoadError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-2 h-7 px-2 text-[11px]"
                    onClick={() => setHistoryRefreshTick((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}

              {messagesLoading && (
                <div className="rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-xs text-amber-800 dark:border-navy-700/50 dark:bg-navy-900/40 dark:text-slate-300">
                  Loading messages…
                </div>
              )}

              {messages.map((m, idx) => {
                const mine = m.senderId === user?.id;
                const createdAt = Number(m.createdAt || 0);
                const canEditDelete = createdAt && Date.now() - createdAt <= EDIT_WINDOW_MS;
                const peerLabel = activeUserId.trim() ? peerUsername || peerShort : 'Peer';
                const senderLabel = mine ? user?.username || 'You' : peerLabel;
                return (
                  <motion.div
                    key={m._id || idx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className={cn('flex w-full', mine ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'relative max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[70%]',
                        mine
                          ? 'rounded-br-md border border-amber-400/50 bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-amber-600/25'
                          : 'rounded-bl-md border border-amber-200/80 bg-white text-amber-950 dark:border-navy-700/60 dark:bg-navy-950/80 dark:text-slate-50'
                      )}
                    >
                      {mine && (
                        <div className="absolute left-1 top-1 z-10" data-message-menu>
                          <button
                            type="button"
                            className="rounded-md p-1.5 text-amber-50/95 transition hover:bg-white/15 hover:text-white"
                            onClick={() => setOpenMessageMenuId((prev) => (prev === m._id ? null : m._id))}
                            aria-label="Message actions"
                            title="Message actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          {openMessageMenuId === m._id && (
                            <div
                              role="menu"
                              className="anim-pop absolute left-0 top-full z-50 mt-1.5 min-w-[170px] overflow-hidden rounded-2xl border border-amber-200/90 bg-white py-1.5 shadow-xl shadow-amber-900/10 dark:border-navy-700/60 dark:bg-navy-950"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors duration-150 hover:bg-amber-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-50 dark:hover:bg-navy-800/60"
                                onClick={() => handleEditMessage(m)}
                                disabled={!canEditDelete}
                                title={canEditDelete ? 'Edit message' : 'Edit only available for 15 minutes'}
                              >
                                <Pencil className="h-4 w-4 shrink-0 opacity-80" />
                                Edit message
                              </button>

                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/50"
                                onClick={() => {
                                  if (!canEditDelete) return;
                                  setOpenMessageMenuId(null);
                                  handleDeleteMessage(m._id);
                                }}
                                disabled={!canEditDelete || deletingMessageId === m._id}
                                title={canEditDelete ? 'Delete message' : 'Delete only available for 15 minutes'}
                              >
                                <Trash2 className="h-4 w-4 shrink-0" />
                                {deletingMessageId === m._id ? 'Deleting…' : 'Delete message'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={cn(
                            'text-[11px] font-semibold tracking-wide',
                            mine ? 'text-amber-100/95' : 'text-amber-600 dark:text-sky-400'
                          )}
                        >
                          {senderLabel}
                        </div>
                      </div>
                      <p className={cn('mt-1 leading-relaxed', mine ? 'text-white' : 'text-amber-950 dark:text-slate-50')}>
                        {m.content}
                      </p>
                    </div>
                  </motion.div>
                );
              })}

              {messages.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
                  <div className="rounded-2xl border border-dashed border-amber-300/70 bg-amber-50/80 px-6 py-8 dark:border-navy-700/50 dark:bg-navy-950/40">
                    <MessageCircle className="mx-auto h-10 w-10 text-amber-400 dark:text-sky-500" />
                    <p className="mt-3 text-sm font-medium text-amber-900 dark:text-slate-100">No messages yet</p>
                    <p className="mt-1 max-w-sm text-xs text-amber-800/80 dark:text-slate-300/80">
                      Start with a quick greeting. (Tip: choose a chat first.)
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!activeUserId.trim() || sendingMessage}
                        onClick={() => sendQuickMessage('hi')}
                      >
                        Hi
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!activeUserId.trim() || sendingMessage}
                        onClick={() => sendQuickMessage('hello')}
                      >
                        Hello
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        disabled={!activeUserId.trim() || sendingMessage}
                        onClick={() => sendQuickMessage('namaste')}
                      >
                        Namaste
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form
              className="flex flex-col gap-2 border-t border-amber-200/60 bg-white/80 p-3 dark:border-navy-700/40 dark:bg-navy-950/70 sm:flex-row sm:items-center"
              onSubmit={sendMessage}
            >
              <input
                className="input flex-1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={activeUserId.trim() ? 'Type a message…' : 'Choose someone to chat…'}
              />
              <Button
                className="shrink-0 gap-2 sm:px-6"
                type="submit"
                disabled={!activeUserId.trim() || !input.trim() || sendingMessage}
              >
                <Send className="h-4 w-4" />
                {sendingMessage ? 'Sending…' : 'Send'}
              </Button>
            </form>

            {actionError && (
              <div className="border-t border-amber-200/60 px-3 py-2 text-xs text-red-700 dark:border-navy-700/40 dark:text-red-300 sm:px-4">
                {actionError}
              </div>
            )}
          </section>
        </div>
      </motion.main>
    </div>
  );
}
