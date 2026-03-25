import {
  get,
  onChildChanged,
  limitToLast,
  off,
  onChildAdded,
  onDisconnect,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  remove,
  runTransaction,
  set,
  update
} from 'firebase/database';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage, getRealtimeDb } from './firebaseClient';

function directThreadId(userA, userB) {
  return [userA, userB].sort().join('__');
}

function mapDmMessage(id, value) {
  return {
    _id: id,
    id,
    senderId: value.senderId,
    receiverId: value.receiverId,
    content: value.content || '',
    mediaUrl: value.mediaUrl || '',
    mediaType: value.mediaType || '',
    fileName: value.fileName || '',
    createdAt: value.createdAt || Date.now(),
    updatedAt: value.updatedAt || null,
    isDeleted: Boolean(value.isDeleted),
    deletedAt: value.deletedAt || null,
    deletedBy: value.deletedBy || null
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

function postMessageBackup(payload) {
  return fetch('/api/message-backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => undefined);
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
  const exactMatch = users.find((item) => normalizeUsername(item?.username) === usernameValue);
  const containsMatch = users.find((item) => normalizeUsername(item?.username).includes(usernameValue));
  const targetUser = exactMatch || containsMatch;

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

export function initializeMyPresence(userId) {
  if (!userId) return () => undefined;

  const realtimeDb = getRealtimeDb();
  const connectedRef = ref(realtimeDb, '.info/connected');
  const sessionsRef = ref(realtimeDb, `presenceSessions/${userId}`);
  const currentSessionRef = push(sessionsRef);
  const userPresenceRef = ref(realtimeDb, `presence/${userId}`);

  const sessionsListener = (snap) => {
    const sessions = snap.exists() ? snap.val() : null;
    const hasAnySession = !!sessions && Object.keys(sessions).length > 0;
    update(userPresenceRef, {
      online: hasAnySession,
      lastSeen: hasAnySession ? null : Date.now()
    }).catch(() => undefined);
  };

  const connectedListener = async (snap) => {
    if (snap.val() !== true) return;
    try {
      await onDisconnect(currentSessionRef).remove();
      await set(currentSessionRef, {
        connectedAt: Date.now(),
        updatedAt: Date.now()
      });
      await update(userPresenceRef, {
        online: true,
        lastSeen: null
      });
    } catch {
      /* ignore transient presence sync failures */
    }
  };

  onValue(sessionsRef, sessionsListener);
  onValue(connectedRef, connectedListener);

  return () => {
    off(sessionsRef, 'value', sessionsListener);
    off(connectedRef, 'value', connectedListener);
    remove(currentSessionRef).catch(() => undefined);
  };
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
  const handleAdded = (snap) => {
    if (!snap.exists()) return;
    callback(mapDmMessage(snap.key, snap.val()), 'added');
  };
  const handleChanged = (snap) => {
    if (!snap.exists()) return;
    callback(mapDmMessage(snap.key, snap.val()), 'changed');
  };
  onChildAdded(threadRef, handleAdded);
  onChildChanged(threadRef, handleChanged);
  return () => {
    off(threadRef, 'child_added', handleAdded);
    off(threadRef, 'child_changed', handleChanged);
  };
}

async function syncRecentDirectChats({ realtimeDb, userId, peerId, threadId }) {
  const latestSnap = await get(query(ref(realtimeDb, `dmMessages/${threadId}`), limitToLast(1)));
  if (!latestSnap.exists()) return;
  const latestEntries = Object.entries(latestSnap.val());
  const [, latestValue] = latestEntries[latestEntries.length - 1];
  const preview = latestValue?.isDeleted
    ? 'This message has been deleted'
    : latestValue?.mediaType === 'image'
      ? 'Photo'
      : latestValue?.mediaType === 'video'
        ? 'Video'
        : latestValue?.content || '';
  const updatedAt = latestValue?.updatedAt || latestValue?.createdAt || Date.now();
  const lastSenderId = latestValue?.senderId || userId;

  await update(ref(realtimeDb), {
    [`recentDirectChats/${userId}/${threadId}/lastMessage`]: preview,
    [`recentDirectChats/${userId}/${threadId}/lastSenderId`]: lastSenderId,
    [`recentDirectChats/${userId}/${threadId}/updatedAt`]: updatedAt,
    [`recentDirectChats/${peerId}/${threadId}/lastMessage`]: preview,
    [`recentDirectChats/${peerId}/${threadId}/lastSenderId`]: lastSenderId,
    [`recentDirectChats/${peerId}/${threadId}/updatedAt`]: updatedAt
  });
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

  postMessageBackup({
    backupKey: `direct:${threadId}:${node.key}`,
    scope: 'direct',
    threadId,
    messageId: node.key,
    senderId,
    receiverId,
    content,
    status: 'active',
    firebaseCreatedAt: now,
    firebaseUpdatedAt: now
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

export async function sendDirectMedia({ senderId, receiverId, file }) {
  if (!senderId || !receiverId || !file) {
    throw new Error('Missing media message parameters.');
  }

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    throw new Error('Only images and videos are supported.');
  }

  const realtimeDb = getRealtimeDb();
  const storage = getFirebaseStorage();
  const threadId = directThreadId(senderId, receiverId);
  const now = Date.now();
  const node = push(ref(realtimeDb, `dmMessages/${threadId}`));
  const messageId = node.key;
  const extension = file.name.includes('.') ? file.name.split('.').pop() : '';
  const mediaRef = storageRef(
    storage,
    `dmMedia/${threadId}/${messageId}${extension ? `.${extension}` : ''}`
  );

  await uploadBytes(mediaRef, file, { contentType: file.type || undefined });
  const mediaUrl = await getDownloadURL(mediaRef);
  const mediaType = isImage ? 'image' : 'video';

  await set(node, {
    senderId,
    receiverId,
    content: '',
    mediaUrl,
    mediaType,
    fileName: file.name || '',
    createdAt: now
  });

  try {
    await update(ref(realtimeDb), {
      [`recentDirectChats/${senderId}/${threadId}`]: {
        peerId: receiverId,
        lastMessage: mediaType === 'image' ? 'Photo' : 'Video',
        lastSenderId: senderId,
        updatedAt: now,
        unreadCount: 0
      },
      [`recentDirectChats/${receiverId}/${threadId}`]: {
        peerId: senderId,
        lastMessage: mediaType === 'image' ? 'Photo' : 'Video',
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

  return messageId;
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
  if (value.isDeleted) return;
  const now = Date.now();
  await update(messageRef, {
    content: 'This message has been deleted',
    isDeleted: true,
    deletedAt: now,
    deletedBy: userId,
    updatedAt: now
  });

  postMessageBackup({
    backupKey: `direct:${threadId}:${messageId}`,
    scope: 'direct',
    threadId,
    messageId,
    senderId: value.senderId || userId,
    receiverId: value.receiverId || peerId,
    content: 'This message has been deleted',
    status: 'deleted',
    firebaseCreatedAt: value.createdAt || now,
    firebaseUpdatedAt: now
  });

  try {
    await syncRecentDirectChats({
      realtimeDb,
      userId,
      peerId,
      threadId
    });
  } catch {
    /* ignore recent index failures to avoid blocking deletes */
  }
}

export async function editDirectMessage({ userId, peerId, messageId, newContent }) {
  if (!userId || !peerId || !messageId) {
    throw new Error('Missing edit message parameters.');
  }
  const content = String(newContent || '').trim();
  if (!content) {
    throw new Error('Message content is required.');
  }

  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const messageRef = ref(realtimeDb, `dmMessages/${threadId}/${messageId}`);
  const snap = await get(messageRef);
  if (!snap.exists()) return;

  const value = snap.val() || {};
  if (value.senderId !== userId) {
    throw new Error('You can only edit your own messages.');
  }
  if (value.isDeleted) {
    throw new Error('Deleted messages cannot be edited.');
  }

  const createdAt = Number(value.createdAt || 0);
  const now = Date.now();
  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  if (createdAt && now - createdAt > EDIT_WINDOW_MS) {
    throw new Error('Edit window expired (15 minutes).');
  }

  await update(messageRef, {
    content,
    updatedAt: now
  });

  postMessageBackup({
    backupKey: `direct:${threadId}:${messageId}`,
    scope: 'direct',
    threadId,
    messageId,
    senderId: value.senderId || userId,
    receiverId: value.receiverId || peerId,
    content,
    status: 'active',
    firebaseCreatedAt: createdAt || now,
    firebaseUpdatedAt: now
  });

  try {
    await syncRecentDirectChats({
      realtimeDb,
      userId,
      peerId,
      threadId
    });
  } catch {
    /* ignore recent index failures to avoid blocking edits */
  }
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

  postMessageBackup({
    backupKey: `group:${normalizedGroupId}:${node.key}`,
    scope: 'group',
    groupId: normalizedGroupId,
    messageId: node.key,
    senderId,
    content: message,
    status: 'active',
    firebaseCreatedAt: Date.now(),
    firebaseUpdatedAt: Date.now()
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
  postMessageBackup({
    backupKey: `group:${normalizedGroupId}:${messageId}`,
    scope: 'group',
    groupId: normalizedGroupId,
    messageId,
    senderId: value.senderId || userId,
    content: 'This message has been deleted',
    status: 'deleted',
    firebaseCreatedAt: value.createdAt || Date.now(),
    firebaseUpdatedAt: Date.now()
  });
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
