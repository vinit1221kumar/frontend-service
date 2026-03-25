'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  addGroupMemberByUsername,
  deleteGroupMessage,
  ensureGroupMembership,
  listGroupMembers,
  listGroupMessages,
  listUserGroups,
  sendGroupMessage as sendFirebaseGroupMessage,
  subscribeGroupMessages
} from '../services/firebaseChat';
import { motion } from 'framer-motion';
import { MessageSquare, Search, Send, Trash2, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMainHeader } from '@/components/AppMainHeader';

export default function GroupChatPage() {
  const { user } = useAuth();
  const [groupInput, setGroupInput] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groupList, setGroupList] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [memberUsername, setMemberUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [panelSuccess, setPanelSuccess] = useState('');
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const groupSearchWrapRef = useRef(null);

  const isMember = !!user?.id && groupMembers.some((member) => member.id === user.id);

  useEffect(() => {
    if (!groupSearchOpen) return;
    const onDoc = (e) => {
      if (groupSearchWrapRef.current && !groupSearchWrapRef.current.contains(e.target)) setGroupSearchOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [groupSearchOpen]);

  useEffect(() => {
    if (!groupId.trim() || !user?.id) {
      setMessages([]);
      return;
    }

    let cancelled = false;
    const seen = new Set();
    let unsubscribe = () => undefined;

    (async () => {
      try {
        await ensureGroupMembership({ groupId: groupId.trim(), userId: user.id });
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
  }, [groupId, user?.id]);

  const loadGroupMembers = async (id) => {
    const normalized = String(id || '').trim();
    if (!normalized) {
      setGroupMembers([]);
      return;
    }
    setMembersLoading(true);
    try {
      const items = await listGroupMembers(normalized);
      setGroupMembers(items);
    } catch {
      setGroupMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const loadUserGroups = async () => {
    if (!user?.id) {
      setGroupList([]);
      return;
    }
    setGroupsLoading(true);
    try {
      const items = await listUserGroups(user.id);
      setGroupList(items);
    } catch {
      setGroupList([]);
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    loadUserGroups();
  }, [user?.id]);

  useEffect(() => {
    loadGroupMembers(groupId);
  }, [groupId]);

  const openGroup = async () => {
    const normalized = groupInput.trim();
    if (!normalized || !user?.id) return;
    setPanelError('');
    setPanelSuccess('');
    try {
      await ensureGroupMembership({ groupId: normalized, userId: user.id });
      setGroupId(normalized);
      setGroupSearchOpen(false);
      await Promise.all([loadUserGroups(), loadGroupMembers(normalized)]);
    } catch {
      setPanelError('Could not open group right now.');
    }
  };

  const handleAddMember = async () => {
    if (!groupId.trim() || !memberUsername.trim() || !user?.id) return;
    setAddingMember(true);
    setPanelError('');
    setPanelSuccess('');
    try {
      const added = await addGroupMemberByUsername({
        groupId: groupId.trim(),
        username: memberUsername.trim(),
        addedById: user.id
      });
      setPanelSuccess(`${added.username} added to group.`);
      setMemberUsername('');
      await Promise.all([loadGroupMembers(groupId.trim()), loadUserGroups()]);
    } catch (err) {
      setPanelError(err?.message || 'Could not add user to group.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleSendGroupMessage = async (e) => {
    e.preventDefault();
    if (!user?.id || !groupId.trim() || !message.trim()) return;
    setSending(true);
    setPanelError('');
    setPanelSuccess('');
    try {
      await sendFirebaseGroupMessage({
        groupId: groupId.trim(),
        senderId: user.id,
        message: message.trim()
      });
      setMessage('');
    } catch (err) {
      setPanelError(err?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const handleDeleteGroupMessage = async (messageId) => {
    if (!groupId.trim() || !user?.id || !messageId) return;
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to delete this message?')) return;
    setDeletingMessageId(messageId);
    try {
      await deleteGroupMessage({
        groupId: groupId.trim(),
        userId: user.id,
        messageId
      });
      setMessages((prev) => prev.filter((item) => item._id !== messageId));
    } catch (err) {
      setPanelError(err?.message || 'Could not delete message.');
    } finally {
      setDeletingMessageId('');
    }
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
        <div className="anim-fade-up mb-3 flex shrink-0 items-start justify-between gap-3 rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-100/80 to-yellow-50/60 px-3 py-2.5 dark:border-navy-700/40 dark:from-navy-900/40 dark:to-navy-950/50 sm:px-4 sm:py-3">
          <div className="min-w-0 flex-1">
            <div className="badge mb-1 inline-block">Group chat</div>
            <p className="text-xs text-amber-900/90 dark:text-slate-100/90 sm:text-sm">
              Open a group, add users by <span className="font-semibold">username</span>, and chat with all members.
            </p>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/80 bg-amber-100/90 text-amber-700 dark:border-navy-600/50 dark:bg-navy-900/60 dark:text-slate-300">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] lg:grid-rows-1 lg:items-stretch lg:gap-5">
        <aside className="card anim-fade-up flex max-h-[38vh] min-h-0 flex-col overflow-visible p-0 [animation-delay:70ms] lg:max-h-none">
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
              <div className="anim-pop absolute left-4 right-4 top-full z-[60] mt-2 overflow-hidden rounded-2xl border border-amber-200/90 bg-white p-3 shadow-xl dark:border-navy-700/60 dark:bg-navy-950">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-sky-400">
                  Group ID
                </label>
                <input
                  className="input mt-1.5 font-mono text-sm"
                  placeholder="e.g. demo-room"
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                />
                <Button type="button" size="sm" className="mt-2 w-full" onClick={openGroup} disabled={!groupInput.trim() || !user?.id}>
                  Open / Create group
                </Button>
                <div className="mt-3 space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-sky-400">
                    Add user by username
                  </label>
                  <div className="flex gap-2">
                    <input
                      className="input h-9 text-sm"
                      placeholder="e.g. alice"
                      value={memberUsername}
                      onChange={(e) => setMemberUsername(e.target.value)}
                      disabled={!groupId.trim()}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="shrink-0"
                      onClick={handleAddMember}
                      disabled={!groupId.trim() || !memberUsername.trim() || addingMember}
                    >
                      <UserPlus className="mr-1 h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-amber-800/80 dark:text-slate-300/85">
                  Open a group first, then add users who already registered.
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

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/90 dark:text-sky-400/90">
                My groups
              </p>
              {groupsLoading ? (
                <p className="text-xs text-amber-800/75 dark:text-slate-300/85">Loading groups…</p>
              ) : groupList.length === 0 ? (
                <p className="text-xs text-amber-800/75 dark:text-slate-300/85">No groups yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {groupList.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => {
                        setGroupId(group.id);
                        setGroupInput(group.id);
                      }}
                      className="w-full rounded-lg border border-amber-200/70 bg-white/70 px-2.5 py-2 text-left text-xs font-medium text-amber-900 hover:bg-amber-50 dark:border-navy-700/50 dark:bg-navy-950/40 dark:text-slate-100 dark:hover:bg-navy-900/50"
                    >
                      <div className="font-mono">{group.id}</div>
                      <div className="text-[11px] opacity-80">{group.memberCount} members</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/90 dark:text-sky-400/90">
                Members
              </p>
              {membersLoading ? (
                <p className="text-xs text-amber-800/75 dark:text-slate-300/85">Loading members…</p>
              ) : groupMembers.length === 0 ? (
                <p className="text-xs text-amber-800/75 dark:text-slate-300/85">No members.</p>
              ) : (
                <div className="space-y-1.5">
                  {groupMembers.map((member) => (
                    <div
                      key={member.id}
                      className="rounded-lg border border-amber-200/70 bg-white/70 px-2.5 py-1.5 text-xs dark:border-navy-700/50 dark:bg-navy-950/40"
                    >
                      <div className="font-medium text-amber-900 dark:text-slate-100">{member.username}</div>
                      <div className="font-mono text-[10px] text-amber-700/85 dark:text-slate-300/80">{member.id}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="card anim-fade-up flex min-h-0 flex-1 flex-col overflow-hidden [animation-delay:130ms]">
          <div className="shrink-0 border-b border-amber-200/60 px-4 py-3 dark:border-navy-700/40">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400" />
              <div>
                <div className="text-sm font-semibold text-amber-950 dark:text-slate-50">Messages</div>
                <div className="text-xs text-amber-800/70 dark:text-slate-300/80">
                  {messages.length} total {groupId.trim() ? `• ${groupMembers.length} members` : ''}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-amber-50/20 px-4 py-4 dark:bg-navy-900/25">
            {messages.map((m, idx) => (
              <motion.div
                key={m._id || idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">{m.senderId}</div>
                  {m.senderId === user?.id && (
                    <button
                      type="button"
                      className="rounded-md p-1 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100"
                      onClick={() => handleDeleteGroupMessage(m._id)}
                      disabled={deletingMessageId === m._id}
                      aria-label="Delete message"
                      title="Delete message"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1 text-slate-900 dark:text-slate-100">{m.message}</div>
              </motion.div>
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
              placeholder={groupId.trim() ? 'Type a message…' : 'Open a group first…'}
            />
            <Button className="whitespace-nowrap" type="submit" disabled={!groupId || !message || !isMember || sending}>
              <Send className="mr-2 h-4 w-4" />
              {sending ? 'Sending…' : 'Send'}
            </Button>
          </form>
          {(panelError || panelSuccess) && (
            <div className="border-t border-amber-200/60 px-4 py-2 text-xs dark:border-navy-700/40">
              {panelError && <p className="text-red-700 dark:text-red-300">{panelError}</p>}
              {!panelError && panelSuccess && <p className="text-emerald-700 dark:text-emerald-300">{panelSuccess}</p>}
            </div>
          )}
        </section>
        </div>
      </motion.main>
    </div>
  );
}

