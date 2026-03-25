import { get, limitToLast, off, onChildAdded, onValue, orderByChild, push, query, ref, remove, runTransaction, set, update } from 'firebase/database';
import { getRealtimeDb } from './firebaseClient';

function directThreadId(userA, userB) {
  return [userA, userB].sort().join('__');
}

function mapDmMessage(id, value) {
  return {
    _id: id,
    id,
    senderId: value.senderId,
    receiverId: value.receiverId,
    content: value.content,
    createdAt: value.createdAt || Date.now()
  };
}

function mapGroupMessage(id, value) {
  return {
    _id: id,
    id,
    senderId: value.senderId,
    message: value.message,
    groupId: value.groupId,
    createdAt: value.createdAt || Date.now()
  };
}

export async function searchUsersByUsername(term, excludeUserId) {
  const realtimeDb = getRealtimeDb();
  const value = term.trim().toLowerCase();
  if (!value) return [];
  const usersSnap = await get(ref(realtimeDb, 'users'));
  if (!usersSnap.exists()) return [];
  const users = usersSnap.val();
  return Object.values(users)
    .filter((user) => user?.uid && user.uid !== excludeUserId)
    .filter((user) => (user.username || '').toLowerCase().includes(value))
    .slice(0, 20)
    .map((user) => ({
      id: user.uid,
      username: user.username || user.email?.split('@')[0] || 'User'
    }));
}

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

export async function ensureGroupMembership({ groupId, userId }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !userId) return;
  const realtimeDb = getRealtimeDb();
  const now = Date.now();
  await update(ref(realtimeDb), {
    [`groups/${normalizedGroupId}/id`]: normalizedGroupId,
    [`groups/${normalizedGroupId}/members/${userId}`]: true,
    [`groups/${normalizedGroupId}/updatedAt`]: now
  });
}

export async function addGroupMemberByUsername({ groupId, username, addedById }) {
  const normalizedGroupId = String(groupId || '').trim();
  const usernameValue = normalizeUsername(username);
  if (!normalizedGroupId || !usernameValue) {
    throw new Error('Group ID and username are required.');
  }

  const realtimeDb = getRealtimeDb();
  const usersSnap = await get(ref(realtimeDb, 'users'));
  if (!usersSnap.exists()) {
    throw new Error('No users found.');
  }

  const users = Object.values(usersSnap.val());
  const targetUser = users.find((item) => normalizeUsername(item?.username) === usernameValue);

  if (!targetUser?.uid) {
    throw new Error('User not found.');
  }

  const now = Date.now();
  await update(ref(realtimeDb), {
    [`groups/${normalizedGroupId}/id`]: normalizedGroupId,
    [`groups/${normalizedGroupId}/members/${targetUser.uid}`]: true,
    [`groups/${normalizedGroupId}/updatedAt`]: now,
    ...(addedById ? { [`groups/${normalizedGroupId}/lastAddedBy`]: addedById } : {})
  });

  return {
    id: targetUser.uid,
    username: targetUser.username || targetUser.email?.split('@')[0] || 'User'
  };
}

export async function listGroupMembers(groupId) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) return [];
  const realtimeDb = getRealtimeDb();

  const [groupSnap, usersSnap] = await Promise.all([
    get(ref(realtimeDb, `groups/${normalizedGroupId}`)),
    get(ref(realtimeDb, 'users'))
  ]);

  if (!groupSnap.exists()) return [];
  const groupValue = groupSnap.val() || {};
  const members = groupValue.members || {};
  const userMap = {};

  if (usersSnap.exists()) {
    Object.values(usersSnap.val()).forEach((item) => {
      if (item?.uid) {
        userMap[item.uid] = {
          id: item.uid,
          username: item.username || item.email?.split('@')[0] || 'User'
        };
      }
    });
  }

  return Object.keys(members)
    .filter((id) => members[id])
    .map((id) => userMap[id] || { id, username: id })
    .sort((a, b) => a.username.localeCompare(b.username));
}

export async function listUserGroups(userId) {
  if (!userId) return [];
  const realtimeDb = getRealtimeDb();
  const groupsSnap = await get(ref(realtimeDb, 'groups'));
  if (!groupsSnap.exists()) return [];

  const groups = groupsSnap.val();
  return Object.entries(groups)
    .map(([id, value]) => ({
      id,
      updatedAt: value?.updatedAt || 0,
      memberCount: Object.values(value?.members || {}).filter(Boolean).length,
      members: value?.members || {}
    }))
    .filter((group) => !!group.members[userId])
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ id, memberCount, updatedAt }) => ({ id, memberCount, updatedAt }));
}

export function subscribeUserPresence(userId, callback) {
  const realtimeDb = getRealtimeDb();
  const userPresenceRef = ref(realtimeDb, `presence/${userId}`);
  const listener = (snap) => {
    if (!snap.exists()) {
      callback({ online: false, lastSeen: null });
      return;
    }
    const value = snap.val();
    callback({
      online: !!value.online,
      lastSeen: value.lastSeen || null
    });
  };
  onValue(userPresenceRef, listener);
  return () => off(userPresenceRef, 'value', listener);
}

export async function setMyPresence(userId, online) {
  const realtimeDb = getRealtimeDb();
  if (!userId) return;
  await update(ref(realtimeDb, `presence/${userId}`), {
    online,
    lastSeen: online ? null : Date.now()
  });
}

export function subscribeRecentDirectChats(userId, callback, limit = 30) {
  const realtimeDb = getRealtimeDb();
  if (!userId) {
    callback([]);
    return () => undefined;
  }

  const recentRef = query(
    ref(realtimeDb, `recentDirectChats/${userId}`),
    orderByChild('updatedAt'),
    limitToLast(limit)
  );

  const listener = async (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }

    const usersSnap = await get(ref(realtimeDb, 'users'));
    const usersById = {};
    if (usersSnap.exists()) {
      Object.values(usersSnap.val()).forEach((item) => {
        if (item?.uid) {
          usersById[item.uid] = item.username || item.email?.split('@')[0] || 'User';
        }
      });
    }

    const items = Object.entries(snap.val())
      .map(([threadId, value]) => ({
        threadId,
        peerId: value.peerId,
        peerUsername: usersById[value.peerId] || 'User',
        lastMessage: value.lastMessage || '',
        lastSenderId: value.lastSenderId || '',
        lastMessageAt: value.updatedAt || 0,
        unreadCount: Number(value.unreadCount || 0)
      }))
      .filter((item) => item.peerId)
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt);

    callback(items);
  };

  onValue(recentRef, listener);
  return () => off(recentRef, 'value', listener);
}

export async function markRecentDirectChatRead(userId, peerId) {
  if (!userId || !peerId) return;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  await update(ref(realtimeDb, `recentDirectChats/${userId}/${threadId}`), {
    unreadCount: 0
  }).catch(() => undefined);
}

export async function listDirectMessages(userId, peerId) {
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const threadRef = query(ref(realtimeDb, `dmMessages/${threadId}`), limitToLast(100));
  const snap = await get(threadRef);
  if (!snap.exists()) return [];
  const raw = snap.val();
  return Object.entries(raw)
    .map(([id, value]) => mapDmMessage(id, value))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function subscribeDirectMessages(userId, peerId, callback) {
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const threadRef = query(ref(realtimeDb, `dmMessages/${threadId}`), limitToLast(100));
  const listener = (snap) => {
    if (!snap.exists()) return;
    callback(mapDmMessage(snap.key, snap.val()));
  };
  onChildAdded(threadRef, listener);
  return () => off(threadRef, 'child_added', listener);
}

export async function sendDirectMessage({ senderId, receiverId, content }) {
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(senderId, receiverId);
  const now = Date.now();
  const node = push(ref(realtimeDb, `dmMessages/${threadId}`));
  await set(node, {
    senderId,
    receiverId,
    content,
    createdAt: now
  });

  try {
    await update(ref(realtimeDb), {
      [`recentDirectChats/${senderId}/${threadId}`]: {
        peerId: receiverId,
        lastMessage: content,
        lastSenderId: senderId,
        updatedAt: now,
        unreadCount: 0
      },
      [`recentDirectChats/${receiverId}/${threadId}`]: {
        peerId: senderId,
        lastMessage: content,
        lastSenderId: senderId,
        updatedAt: now
      }
    });

    const unreadRef = ref(realtimeDb, `recentDirectChats/${receiverId}/${threadId}/unreadCount`);
    await runTransaction(unreadRef, (current) => {
      const safe = Number(current || 0);
      return safe + 1;
    });
  } catch {
    /* ignore recent index failures to avoid blocking messages */
  }

  return node.key;
}

export async function deleteDirectMessage({ userId, peerId, messageId }) {
  if (!userId || !peerId || !messageId) {
    throw new Error('Missing delete message parameters.');
  }
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const messageRef = ref(realtimeDb, `dmMessages/${threadId}/${messageId}`);
  const snap = await get(messageRef);
  if (!snap.exists()) return;
  const value = snap.val() || {};
  if (value.senderId !== userId) {
    throw new Error('You can only delete your own messages.');
  }
  await remove(messageRef);
}

export async function listGroupMessages(groupId) {
  const realtimeDb = getRealtimeDb();
  const groupRef = query(ref(realtimeDb, `groupMessages/${groupId}`), limitToLast(150));
  const snap = await get(groupRef);
  if (!snap.exists()) return [];
  return Object.entries(snap.val())
    .map(([id, value]) => mapGroupMessage(id, value))
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function subscribeGroupMessages(groupId, callback) {
  const realtimeDb = getRealtimeDb();
  const groupRef = query(ref(realtimeDb, `groupMessages/${groupId}`), limitToLast(150));
  const listener = (snap) => {
    if (!snap.exists()) return;
    callback(mapGroupMessage(snap.key, snap.val()));
  };
  onChildAdded(groupRef, listener);
  return () => off(groupRef, 'child_added', listener);
}

export async function sendGroupMessage({ groupId, senderId, message }) {
  const realtimeDb = getRealtimeDb();
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !senderId) {
    throw new Error('Group ID and sender are required.');
  }

  const membershipSnap = await get(ref(realtimeDb, `groups/${normalizedGroupId}/members/${senderId}`));
  if (!membershipSnap.exists() || !membershipSnap.val()) {
    throw new Error('You are not a member of this group.');
  }

  const node = push(ref(realtimeDb, `groupMessages/${normalizedGroupId}`));
  await set(node, {
    groupId: normalizedGroupId,
    senderId,
    message,
    createdAt: Date.now()
  });
  return node.key;
}

export async function deleteGroupMessage({ groupId, userId, messageId }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !userId || !messageId) {
    throw new Error('Missing delete message parameters.');
  }
  const realtimeDb = getRealtimeDb();
  const messageRef = ref(realtimeDb, `groupMessages/${normalizedGroupId}/${messageId}`);
  const snap = await get(messageRef);
  if (!snap.exists()) return;
  const value = snap.val() || {};
  if (value.senderId !== userId) {
    throw new Error('You can only delete your own messages.');
  }
  await remove(messageRef);
}

export async function startVoiceCallSession({ callerId, calleeId }) {
  const realtimeDb = getRealtimeDb();
  const node = push(ref(realtimeDb, 'calls'));
  await set(node, {
    callerId,
    calleeId,
    status: 'active',
    startedAt: Date.now()
  });
  return node.key;
}

export async function endVoiceCallSession(callId) {
  const realtimeDb = getRealtimeDb();
  await update(ref(realtimeDb, `calls/${callId}`), {
    status: 'ended',
    endedAt: Date.now()
  });
}
