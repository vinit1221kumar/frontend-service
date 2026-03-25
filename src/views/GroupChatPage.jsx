'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  addGroupMemberByUsername,
  deleteGroupMessage,
  ensureGroupMembership,
  leaveGroupMembership,
  listGroupMembers,
  removeGroupMember,
  setGroupPhoto,
  listGroupMessages,
  listUserGroups,
  sendGroupMessage as sendFirebaseGroupMessage,
  setGroupMuted,
  subscribeGroupMessages
} from '../services/firebaseChat';
import { motion } from 'framer-motion';
import { BellOff, Camera, LogOut, MessageSquare, MoreVertical, Search, Send, Trash2, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppMainHeader } from '@/components/AppMainHeader';
import { cn } from '@/lib/utils';

export default function GroupChatPage() {
  const { user } = useAuth();
  const [groupInput, setGroupInput] = useState('');
  const [groupId, setGroupId] = useState('');
  const [groupList, setGroupList] = useState([]);
  const [groupMembers, setGroupMembers] = useState([]);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [recentlyAddedMemberId, setRecentlyAddedMemberId] = useState('');
  const [memberUsername, setMemberUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [groupsLoadError, setGroupsLoadError] = useState('');
  const [membersLoadError, setMembersLoadError] = useState('');
  const [messagesLoadError, setMessagesLoadError] = useState('');
  const [panelError, setPanelError] = useState('');
  const [panelSuccess, setPanelSuccess] = useState('');
  const [groupsRefreshTick, setGroupsRefreshTick] = useState(0);
  const [membersRefreshTick, setMembersRefreshTick] = useState(0);
  const [messagesRefreshTick, setMessagesRefreshTick] = useState(0);
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [groupMuted, setGroupMuted] = useState(false);
  const [membersModalOpen, setMembersModalOpen] = useState(false);
  const [kickingMemberId, setKickingMemberId] = useState('');
  const [updatingPhoto, setUpdatingPhoto] = useState(false);
  const [groupPhotoUrl, setGroupPhotoUrl] = useState('');
  const groupSearchWrapRef = useRef(null);
  const groupMenuRef = useRef(null);
  const groupPhotoInputRef = useRef(null);

  const isMember = !!user?.id && groupMembers.some((member) => member.id === user.id);
  const senderNamesById = groupMembers.reduce((acc, member) => {
    acc[member.id] = member.username || member.id;
    return acc;
  }, {});

  if (user?.id) {
    senderNamesById[user.id] = user.username || senderNamesById[user.id] || user.id;
  }

  const getMemberLabel = useCallback((member) => {
    if (member.id === user?.id) {
      return user?.username || 'You';
    }
    return member.username || member.id;
  }, [user?.id, user?.username]);

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
      setMessagesLoading(false);
      setMessagesLoadError('');
      return;
    }

    setMessagesLoading(true);
    setMessagesLoadError('');

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
        setMessagesLoading(false);
        unsubscribe = subscribeGroupMessages(groupId.trim(), (msg) => {
          if (seen.has(msg._id)) return;
          seen.add(msg._id);
          setMessages((prev) => [...prev, msg]);
        });
      } catch (err) {
        if (!cancelled) {
          setMessagesLoadError(err?.message || 'Could not load group messages.');
          setMessagesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [groupId, user?.id, messagesRefreshTick]);

  const loadGroupMembers = useCallback(async (id) => {
    const normalized = String(id || '').trim();
    if (!normalized) {
      setGroupMembers([]);
      setMembersLoadError('');
      return;
    }
    setMembersLoading(true);
    setMembersLoadError('');
    try {
      const items = await listGroupMembers(normalized);
      setGroupMembers(items);
    } catch (err) {
      setMembersLoadError(err?.message || 'Could not load group members.');
    } finally {
      setMembersLoading(false);
    }
  }, []);

  const loadUserGroups = useCallback(async () => {
    if (!user?.id) {
      setGroupList([]);
      setGroupsLoadError('');
      return;
    }
    setGroupsLoading(true);
    setGroupsLoadError('');
    try {
      const items = await listUserGroups(user.id);
      setGroupList(items);
    } catch (err) {
      setGroupsLoadError(err?.message || 'Could not load groups.');
    } finally {
      setGroupsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUserGroups();
  }, [loadUserGroups, groupsRefreshTick]);

  useEffect(() => {
    loadGroupMembers(groupId);
  }, [groupId, loadGroupMembers, membersRefreshTick]);

  useEffect(() => {
    const selectedGroup = groupList.find((item) => item.id === groupId.trim());
    setGroupPhotoUrl(selectedGroup?.photoUrl || '');
  }, [groupList, groupId]);

  useEffect(() => {
    if (!recentlyAddedMemberId) return;
    const timeout = setTimeout(() => setRecentlyAddedMemberId(''), 2200);
    return () => clearTimeout(timeout);
  }, [recentlyAddedMemberId]);

  useEffect(() => {
    if (!groupMenuOpen) return;
    const onDoc = (e) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target)) setGroupMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [groupMenuOpen]);

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
    } catch (err) {
      setPanelError(err?.message || 'Could not open group right now.');
    }
  };

  const handleAddMember = async () => {
    const targetGroupId = groupId.trim() || groupInput.trim();
    if (!targetGroupId || !memberUsername.trim() || !user?.id) return;
    setAddingMember(true);
    setPanelError('');
    setPanelSuccess('');
    try {
      await ensureGroupMembership({ groupId: targetGroupId, userId: user.id });
      const added = await addGroupMemberByUsername({
        groupId: targetGroupId,
        username: memberUsername.trim(),
        addedById: user.id
      });
      setGroupId(targetGroupId);
      setGroupInput(targetGroupId);
      setPanelSuccess(`${added.username} added to group.`);
      setRecentlyAddedMemberId(added.id);
      setMemberUsername('');
      await Promise.all([loadGroupMembers(targetGroupId), loadUserGroups()]);
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

  const handleLeaveGroup = async () => {
    if (!groupId.trim() || !user?.id) return;
    if (typeof window !== 'undefined' && !window.confirm('Leave this group?')) return;
    setPanelError('');
    setPanelSuccess('');
    try {
      await leaveGroupMembership({ groupId: groupId.trim(), userId: user.id });
      setPanelSuccess('You left the group.');
      setGroupId('');
      setMessages([]);
      setGroupMembers([]);
      setGroupMenuOpen(false);
      await loadUserGroups();
    } catch (err) {
      setPanelError(err?.message || 'Could not leave group.');
    }
  };

  const handleShowMembers = () => {
    if (!groupId.trim()) return;
    setMembersModalOpen(true);
    setGroupMenuOpen(false);
  };

  const handleKickMember = async (member) => {
    if (!groupId.trim() || !user?.id || !member?.id) return;
    if (member.id === user.id) {
      setPanelError('You cannot kick yourself. Use Leave group.');
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Kick ${member.username || member.id} from this group?`)
    )
      return;
    setKickingMemberId(member.id);
    setPanelError('');
    setPanelSuccess('');
    try {
      await removeGroupMember({
        groupId: groupId.trim(),
        actorId: user.id,
        memberId: member.id
      });
      setPanelSuccess(`${member.username || member.id} removed from group.`);
      await Promise.all([loadGroupMembers(groupId.trim()), loadUserGroups()]);
    } catch (err) {
      setPanelError(err?.message || 'Could not kick member.');
    } finally {
      setKickingMemberId('');
    }
  };

  const handleGroupPhotoPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !groupId.trim() || !user?.id) return;
    setUpdatingPhoto(true);
    setPanelError('');
    setPanelSuccess('');
    try {
      const nextPhotoUrl = await setGroupPhoto({
        groupId: groupId.trim(),
        actorId: user.id,
        file
      });
      setGroupPhotoUrl(nextPhotoUrl);
      setPanelSuccess('Group photo updated.');
      await loadUserGroups();
    } catch (err) {
      setPanelError(err?.message || 'Could not update group photo.');
    } finally {
      setUpdatingPhoto(false);
    }
  };

  const handleToggleMuteGroup = async () => {
    if (!groupId.trim() || !user?.id) return;
    const next = !groupMuted;
    try {
      await setGroupMuted({ groupId: groupId.trim(), userId: user.id, muted: next });
      setGroupMuted(next);
      setPanelSuccess(next ? 'Group muted.' : 'Group unmuted.');
      setGroupMenuOpen(false);
    } catch (err) {
      setPanelError(err?.message || 'Could not update mute setting.');
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
                      disabled={!(groupId.trim() || groupInput.trim()) || !memberUsername.trim() || addingMember}
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
                <div>Current group</div>
                <div className="font-mono text-xs opacity-80">{groupId.trim()}</div>
              </div>
            ) : (
              <p className="text-xs text-amber-800/75 dark:text-sky-400/85">Tap the search icon next to Group to set a group ID.</p>
            )}

            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700/90 dark:text-sky-400/90">
                My groups
              </p>
              {groupsLoadError && (
                <div className="mb-2 rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-300">
                  <p>{groupsLoadError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-1 h-7 px-2 text-[11px]"
                    onClick={() => setGroupsRefreshTick((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}
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
                      <div>Group {group.id}</div>
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
              {membersLoadError && (
                <div className="mb-2 rounded-lg border border-red-400/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-700 dark:text-red-300">
                  <p>{membersLoadError}</p>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="mt-1 h-7 px-2 text-[11px]"
                    onClick={() => setMembersRefreshTick((value) => value + 1)}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {membersLoading ? (
                <p className="text-xs text-amber-800/75 dark:text-slate-300/85">Loading members…</p>
              ) : groupMembers.length === 0 ? (
                <p className="text-xs text-amber-800/75 dark:text-slate-300/85">No members.</p>
              ) : (
                <div className="space-y-1.5">
                  {groupMembers.map((member) => (
                    <div
                      key={member.id}
                      className={cn(
                        'rounded-lg border border-amber-200/70 bg-white/70 px-2.5 py-1.5 text-xs transition-colors duration-300 dark:border-navy-700/50 dark:bg-navy-950/40',
                        recentlyAddedMemberId === member.id &&
                          'border-emerald-300 bg-emerald-50/80 animate-pulse dark:border-emerald-500/40 dark:bg-emerald-900/20'
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-amber-900 dark:text-slate-100">{getMemberLabel(member)}</div>
                        {recentlyAddedMemberId === member.id && (
                          <span className="rounded-full bg-emerald-600/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                            New
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="card anim-fade-up flex min-h-0 flex-1 flex-col overflow-hidden [animation-delay:130ms]">
          <div className="shrink-0 border-b border-amber-200/60 px-4 py-3 dark:border-navy-700/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 shrink-0 text-amber-600 dark:text-sky-400" />
                <div>
                  <div className="text-sm font-semibold text-amber-950 dark:text-slate-50">Messages</div>
                  <div className="text-xs text-amber-800/70 dark:text-slate-300/80">
                    {messages.length} total {groupId.trim() ? `• ${groupMembers.length} members` : ''}
                    {groupMuted ? ' • muted' : ''}
                  </div>
                </div>
              </div>
              <div ref={groupMenuRef} className="relative">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setGroupMenuOpen((o) => !o)}
                  aria-label="Group options"
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
                {groupMenuOpen && (
                  <div
                    role="menu"
                    className="anim-pop absolute right-0 top-full z-40 mt-1.5 min-w-[190px] overflow-hidden rounded-xl border border-amber-200/90 bg-white py-1.5 shadow-xl shadow-amber-900/10 dark:border-navy-700/60 dark:bg-navy-950"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
                      onClick={handleShowMembers}
                    >
                      <Users className="h-4 w-4 shrink-0 opacity-80" />
                      Show members
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-amber-950 transition-colors hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
                      onClick={handleToggleMuteGroup}
                    >
                      <BellOff className="h-4 w-4 shrink-0 opacity-80" />
                      {groupMuted ? 'Unmute group' : 'Mute group'}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                      onClick={handleLeaveGroup}
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      Leave group
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-amber-50/20 px-4 py-4 dark:bg-navy-900/25">
            {messagesLoadError && (
              <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                <p>{messagesLoadError}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-2 h-7 px-2 text-[11px]"
                  onClick={() => setMessagesRefreshTick((value) => value + 1)}
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
              const senderName =
                m.senderId === user?.id ? user?.username || 'You' : senderNamesById[m.senderId] || 'Group member';
              const mine = m.senderId === user?.id;

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
                      'w-full max-w-[85%] rounded-xl border px-3 py-2 text-sm sm:max-w-[72%]',
                      mine
                        ? 'border-amber-400/50 bg-gradient-to-br from-amber-500 to-amber-600 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-100'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className={cn('text-xs font-medium', mine ? 'text-amber-100/90' : 'text-slate-600 dark:text-slate-300')}>
                        {senderName}
                      </div>
                      {mine && (
                        <button
                          type="button"
                          className={cn(
                            'rounded-md p-1 transition',
                            mine
                              ? 'text-amber-100 hover:bg-white/15 hover:text-white'
                              : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-slate-100'
                          )}
                          onClick={() => handleDeleteGroupMessage(m._id)}
                          disabled={deletingMessageId === m._id}
                          aria-label="Delete message"
                          title="Delete message"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className={cn('mt-1', mine ? 'text-white' : 'text-slate-900 dark:text-slate-100')}>{m.message}</div>
                  </div>
                </motion.div>
              );
            })}
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

      {membersModalOpen && (
        <div className="fixed inset-0 z-[150] bg-black/55 backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col bg-white dark:bg-navy-950">
            <div className="flex items-center justify-between border-b border-amber-200/70 px-4 py-3 dark:border-navy-700/40">
              <div>
                <p className="text-sm font-semibold text-amber-950 dark:text-slate-50">Group members</p>
                <p className="text-xs text-amber-700/85 dark:text-slate-300/85">
                  {groupId.trim() || 'No group selected'} • {groupMembers.length} members
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setMembersModalOpen(false)}
                aria-label="Close members panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
              {membersLoading ? (
                <p className="text-sm text-amber-800/80 dark:text-slate-300/85">Loading members…</p>
              ) : groupMembers.length === 0 ? (
                <p className="text-sm text-amber-800/80 dark:text-slate-300/85">No members in this group.</p>
              ) : (
                groupMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2 dark:border-navy-700/40 dark:bg-navy-900/35"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-amber-950 dark:text-slate-100">{getMemberLabel(member)}</p>
                      <p className="truncate text-xs text-amber-700/80 dark:text-slate-300/80">{member.id}</p>
                    </div>
                    {member.id !== user?.id && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-8 px-2.5 text-xs text-red-700 hover:text-red-700 dark:text-red-400"
                        onClick={() => handleKickMember(member)}
                        disabled={kickingMemberId === member.id}
                      >
                        {kickingMemberId === member.id ? 'Kicking…' : 'Kick member'}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-amber-200/70 px-4 py-3 dark:border-navy-700/40">
              <input
                ref={groupPhotoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleGroupPhotoPick}
              />
              <div className="mb-3 flex items-center gap-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-2.5 dark:border-navy-700/40 dark:bg-navy-900/35">
                {groupPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={groupPhotoUrl} alt="Group" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-200/80 text-amber-800 dark:bg-navy-800/80 dark:text-slate-200">
                    <Users className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-amber-950 dark:text-slate-100">Group photo</p>
                  <p className="truncate text-xs text-amber-700/80 dark:text-slate-300/80">
                    {groupPhotoUrl ? 'Tap to change current photo' : 'No group photo yet'}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => groupPhotoInputRef.current?.click()}
                  disabled={!groupId.trim() || updatingPhoto}
                >
                  <Camera className="mr-1 h-3.5 w-3.5" />
                  {updatingPhoto ? 'Uploading…' : groupPhotoUrl ? 'Change' : 'Add'}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setMembersModalOpen(false);
                    setGroupSearchOpen(true);
                  }}
                  disabled={!groupId.trim()}
                >
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Add new member
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMembersModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
