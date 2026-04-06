import {
  endAt,
  get,
  limitToFirst,
  onChildChanged,
  onChildRemoved,
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
  startAt,
  update
} from 'firebase/database';
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFirebaseAuth, getFirebaseStorage, getRealtimeDb } from './firebaseClient';
import { subscribeToAuthState } from './firebaseAuth';

function directThreadId(userA, userB) {
  return [userA, userB].sort().join('__');
}

function createDirectChatIndexEntry({ ownerId, peerId, lastMessage, lastSenderId, updatedAt, unreadCount }) {
  return {
    peerId,
    lastMessage: lastMessage || '',
    lastSenderId: lastSenderId || '',
    updatedAt: Number(updatedAt || 0),
    unreadCount: Number(unreadCount || 0),
    ...(ownerId && peerId
      ? {
          participants: {
            [ownerId]: true,
            [peerId]: true
          }
        }
      : {})
  };
}

function normalizeRecentDirectItem({ threadId, value, activeUserId, usersById }) {
  const itemValue = value || {};
  const peerId = itemValue.peerId || itemValue.otherUserId || itemValue.participantId || '';
  const participants = itemValue.participants || {};
  if (!peerId) return null;
  if (activeUserId && Object.keys(participants).length > 0 && !participants[activeUserId]) {
    return null;
  }
  const updatedAt = Number(itemValue.updatedAt || itemValue.lastMessageAt || itemValue.lastUpdatedAt || 0);
  return {
    threadId,
    peerId,
    peerUsername: usersById[peerId] || 'User',
    lastMessage: itemValue.lastMessage || itemValue.preview || '',
    lastSenderId: itemValue.lastSenderId || '',
    lastMessageAt: updatedAt,
    unreadCount: Number(itemValue.unreadCount || 0),
    archived: Boolean(itemValue.archived),
    locked: Boolean(itemValue.locked)
  };
}

function createRecentDirectChatsSubscription({ userId, callback, limit = 30 }) {
  const realtimeDb = getRealtimeDb();
  const userChatsRef = query(ref(realtimeDb, `userChats/${userId}`), orderByChild('updatedAt'), limitToLast(limit));
  const recentRef = query(
    ref(realtimeDb, `recentDirectChats/${userId}`),
    orderByChild('updatedAt'),
    limitToLast(limit)
  );

  let userChatsMap = {};
  let recentChatsMap = {};
  let usersById = null;

  const loadUsersById = async () => {
    if (usersById) return usersById;
    const usersSnap = await get(ref(realtimeDb, 'users'));
    const nextUsersById = {};
    if (usersSnap.exists()) {
      Object.values(usersSnap.val()).forEach((item) => {
        if (item?.uid) {
          nextUsersById[item.uid] = item.username || item.email?.split('@')[0] || 'User';
        }
      });
    }
    usersById = nextUsersById;
    return usersById;
  };

  const emit = async () => {
    try {
      const usernamesById = await loadUsersById();
      const merged = {
        ...(recentChatsMap || {}),
        ...(userChatsMap || {})
      };
      const items = Object.entries(merged)
        .map(([threadId, value]) =>
          normalizeRecentDirectItem({ threadId, value, activeUserId: userId, usersById: usernamesById })
        )
        .filter(Boolean)
        .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
        .slice(0, limit);
      callback(items);
    } catch {
      callback([]);
    }
  };

  const userChatsListener = (snap) => {
    userChatsMap = snap.exists() ? snap.val() || {} : {};
    emit();
  };
  const recentChatsListener = (snap) => {
    recentChatsMap = snap.exists() ? snap.val() || {} : {};
    emit();
  };

  onValue(userChatsRef, userChatsListener);
  onValue(recentRef, recentChatsListener);

  return () => {
    off(userChatsRef, 'value', userChatsListener);
    off(recentRef, 'value', recentChatsListener);
  };
}

function getGroupMemberRole(membershipValue) {
  // Backward compatibility:
  // - Legacy shape: `members/{uid}: true` => treat as `member`
  // - New shape: `members/{uid}: { role: 'admin'|'member' }`
  if (membershipValue === true) return 'member';
  if (membershipValue && typeof membershipValue === 'object') {
    const role = membershipValue.role;
    if (role === 'admin' || role === 'member') return role;
  }
  return 'member';
}

function sanitizeStorageExtension(ext) {
  // FIX: Storage paths should not include weird characters coming from filenames.
  const clean = String(ext || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return clean.slice(0, 10);
}

async function withRetry(fn, retries = 2) {
  // FIX: retry transient upload/download failures (network blips / eventual consistency).
  // Keeping retry logic local avoids changing APIs or architecture.
  let lastErr;
  for (let i = 0; i <= retries; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      // small exponential backoff
      const delay = 250 * Math.pow(2, i);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
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
    fileSize: Number(value.fileSize || 0),
    contentType: value.contentType || '',
    createdAt: value.createdAt || Date.now(),
    updatedAt: value.updatedAt || null,
    isDeleted: Boolean(value.isDeleted),
    deletedAt: value.deletedAt || null,
    deletedBy: value.deletedBy || null,
    // FIX: delivered receipts (backward compatible)
    deliveredBy: value.deliveredBy || {},
    // FIX: read receipts (backward compatible: absent => unread for that user)
    readBy: value.readBy || {},
    reactions: value.reactions || {}
  };
}

function mapGroupMessage(id, value) {
  return {
    _id: id,
    id,
    senderId: value.senderId,
    message: value.message,
    groupId: value.groupId,
    createdAt: value.createdAt || Date.now(),
    // FIX: delivered receipts (backward compatible)
    deliveredBy: value.deliveredBy || {},
    // FIX: group read receipts (backward compatible)
    readBy: value.readBy || {},
    reactions: value.reactions || {}
  };
}

/**
 * FIX: Upload + persist user profile photo in a stable per-UID location.
 * Storage: userPhotos/{uid}/avatar.<ext>
 * Realtime DB: users/{uid}/photoURL
 */
export async function setUserProfilePhoto({ userId, file }) {
  if (!userId || !file) throw new Error('User ID and photo file are required.');
  if (!String(file.type || '').startsWith('image/')) throw new Error('Only image files are supported.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Photo must be ≤ 5MB.');

  const realtimeDb = getRealtimeDb();
  const storage = getFirebaseStorage();
  const extension = sanitizeStorageExtension(file.name.includes('.') ? file.name.split('.').pop() : '');
  const photoRef = storageRef(storage, `userPhotos/${userId}/avatar${extension ? `.${extension}` : ''}`);

  // FIX: uploadBytes/getDownloadURL occasionally fail under transient network errors; retry.
  await withRetry(() => uploadBytes(photoRef, file, { contentType: file.type || undefined }));
  const photoURL = await withRetry(() => getDownloadURL(photoRef));

  await update(ref(realtimeDb, `users/${userId}`), {
    photoURL,
    photoUpdatedAt: Date.now()
  });

  return photoURL;
}

/**
 * Remove persisted user profile photo.
 * Best-effort deletes storage object when URL points to this project's bucket.
 */
export async function clearUserProfilePhoto({ userId, photoURL }) {
  if (!userId) throw new Error('User ID is required.');
  const realtimeDb = getRealtimeDb();
  const storage = getFirebaseStorage();

  if (photoURL && typeof photoURL === 'string') {
    try {
      const marker = '/o/';
      const markerIndex = photoURL.indexOf(marker);
      if (markerIndex >= 0) {
        const encodedPath = photoURL.slice(markerIndex + marker.length).split('?')[0] || '';
        const decodedPath = decodeURIComponent(encodedPath);
        if (decodedPath.startsWith(`userPhotos/${userId}/`)) {
          await deleteObject(storageRef(storage, decodedPath));
        }
      }
    } catch {
      // Best-effort cleanup; DB state should still be updated.
    }
  }

  await update(ref(realtimeDb, `users/${userId}`), {
    photoURL: null,
    photoUpdatedAt: Date.now(),
  });
}

/**
 * FIX: Mark last N direct messages as read for a user.
 * Minimal approach: update readBy on existing messages (limit=100) to avoid heavy scans.
 */
export async function markDirectThreadRead({ userId, peerId, limit = 100 }) {
  if (!userId || !peerId) return;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const snap = await get(query(ref(realtimeDb, `dmMessages/${threadId}`), limitToLast(limit)));
  if (!snap.exists()) return;
  const raw = snap.val() || {};

  const updates = {};
  Object.entries(raw).forEach(([messageId, value]) => {
    const v = value || {};
    // Only mark messages addressed to me (or already in the thread) as read.
    if (v.receiverId === userId && !(v.readBy && v.readBy[userId])) {
      // FIX: write delivered receipts too (receiver opened chat => message is delivered).
      updates[`dmMessages/${threadId}/${messageId}/deliveredBy/${userId}`] = true;
      updates[`dmMessages/${threadId}/${messageId}/deliveredAt/${userId}`] = Date.now();
      updates[`dmMessages/${threadId}/${messageId}/readBy/${userId}`] = true;
      updates[`dmMessages/${threadId}/${messageId}/readAt/${userId}`] = Date.now();
    }
  });
  if (Object.keys(updates).length === 0) return;
  await update(ref(realtimeDb), updates);
}

/**
 * FIX: Mark last N group messages as read for a user.
 */
export async function markGroupThreadRead({ groupId, userId, limit = 150 }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !userId) return;
  const realtimeDb = getRealtimeDb();
  const snap = await get(query(ref(realtimeDb, `groupMessages/${normalizedGroupId}`), limitToLast(limit)));
  if (!snap.exists()) return;
  const raw = snap.val() || {};

  const updates = {};
  Object.entries(raw).forEach(([messageId, value]) => {
    const v = value || {};
    if (!(v.readBy && v.readBy[userId])) {
      // FIX: write delivered receipts too.
      updates[`groupMessages/${normalizedGroupId}/${messageId}/deliveredBy/${userId}`] = true;
      updates[`groupMessages/${normalizedGroupId}/${messageId}/deliveredAt/${userId}`] = Date.now();
      updates[`groupMessages/${normalizedGroupId}/${messageId}/readBy/${userId}`] = true;
      updates[`groupMessages/${normalizedGroupId}/${messageId}/readAt/${userId}`] = Date.now();
    }
  });
  if (Object.keys(updates).length === 0) return;
  await update(ref(realtimeDb), updates);
}

export async function searchUsersByUsername(term, excludeUserId) {
  const realtimeDb = getRealtimeDb();
  const raw = String(term || '').trim();
  const value = raw.toLowerCase();
  if (!value) return [];

  const runQuery = async (field, queryValue) => {
    const usersQuery = query(
      ref(realtimeDb, 'users'),
      orderByChild(field),
      startAt(queryValue),
      endAt(queryValue + '\uf8ff'),
      limitToFirst(20)
    );
    const snap = await get(usersQuery);
    if (!snap.exists()) return [];
    const items = [];
    snap.forEach((child) => {
      const user = child.val();
      if (user?.uid && user.uid !== excludeUserId) {
        items.push({
          id: user.uid,
          username: user.username || user.email?.split('@')[0] || 'User'
        });
      }
    });
    return items;
  };

  // Prefer case-insensitive prefix search via usernameLower when available.
  // If Firebase rules are still indexing "username" only, fall back gracefully.
  try {
    return await runQuery('usernameLower', value);
  } catch {
    const merged = new Map();
    const byLower = await runQuery('username', value).catch(() => []);
    byLower.forEach((u) => merged.set(u.id, u));

    // Optional second attempt with raw term (in case usernames were saved with uppercase prefixes)
    if (raw && raw !== value) {
      const byRaw = await runQuery('username', raw).catch(() => []);
      byRaw.forEach((u) => merged.set(u.id, u));
    }

    return Array.from(merged.values()).slice(0, 20);
  }
}

export async function getUserProfileById(userId) {
  // FIX: Provide display data for call UI by fetching from the canonical users/{uid} node.
  if (!userId) return null;
  const realtimeDb = getRealtimeDb();
  const snap = await get(ref(realtimeDb, `users/${userId}`));
  if (!snap.exists()) return null;
  const v = snap.val() || {};
  return {
    id: userId,
    uid: v.uid || userId,
    username: v.username || v.email?.split('@')[0] || 'User',
    email: v.email || '',
    photoURL: v.photoURL || ''
  };
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

  // FIX: First joiner becomes ADMIN. Backward compatible with legacy members stored as `true`.
  const groupSnap = await get(ref(realtimeDb, `groups/${normalizedGroupId}`));
  const groupVal = groupSnap.exists() ? groupSnap.val() || {} : {};
  const members = groupVal.members || {};

  if (!groupSnap.exists()) {
    await update(ref(realtimeDb), {
      [`groups/${normalizedGroupId}/id`]: normalizedGroupId,
      [`groups/${normalizedGroupId}/createdBy`]: userId,
      [`groups/${normalizedGroupId}/members/${userId}`]: { role: 'admin' },
      [`groups/${normalizedGroupId}/updatedAt`]: now
    });
    return;
  }

  const currentMembership = members[userId];
  // New member
  if (currentMembership === undefined || currentMembership === null) {
    await update(ref(realtimeDb), {
      [`groups/${normalizedGroupId}/id`]: normalizedGroupId,
      [`groups/${normalizedGroupId}/members/${userId}`]: { role: 'member' },
      [`groups/${normalizedGroupId}/updatedAt`]: now
    });
    return;
  }

  // Convert legacy `true` to {role:'member'} without overwriting existing roles.
  if (currentMembership === true) {
    await update(ref(realtimeDb), {
      [`groups/${normalizedGroupId}/members/${userId}`]: { role: 'member' },
      [`groups/${normalizedGroupId}/updatedAt`]: now
    });
  }
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
    // FIX: Added members default to MEMBER role.
    [`groups/${normalizedGroupId}/members/${targetUser.uid}`]: { role: 'member' },
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
    .map((id) => {
      const base = userMap[id] || { id, username: id };
      // FIX: expose admin/member role in the members list.
      return {
        ...base,
        role: getGroupMemberRole(members[id])
      };
    })
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
      photoUrl: value?.photoUrl || '',
      memberCount: Object.values(value?.members || {}).filter(Boolean).length,
      members: value?.members || {}
    }))
    .filter((group) => !!group.members[userId])
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map(({ id, memberCount, updatedAt, photoUrl }) => ({ id, memberCount, updatedAt, photoUrl }));
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

  const writeSession = async () => {
    await onDisconnect(currentSessionRef).remove();
    await set(currentSessionRef, { connectedAt: Date.now(), updatedAt: Date.now() });
    await update(userPresenceRef, { online: true, lastSeen: null });
  };

  const connectedListener = async (snap) => {
    if (snap.val() !== true) return;

    const auth = getFirebaseAuth();
    const currentUser = auth?.currentUser;
    // Guard: only write if auth confirms this user is signed in.
    if (!currentUser || currentUser.uid !== userId) return;

    try {
      // Calling getIdToken() ensures the RTDB WebSocket receives the latest
      // auth token before we attempt the write — the SDK re-authenticates
      // the socket when a fresh token is obtained.
      await currentUser.getIdToken();
      await writeSession();
    } catch (firstErr) {
      const isPermDenied =
        String(firstErr?.code).includes('permission') ||
        String(firstErr?.message).toLowerCase().includes('permission_denied');

      if (!isPermDenied) return;

      // On permission_denied, force a token refresh and retry once.
      // The RTDB socket auth can lag by a few hundred ms after onAuthStateChanged.
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        await currentUser.getIdToken(/* forceRefresh */ true);
        await writeSession();
      } catch {
        /* best-effort — presence will recover on next reconnect */
      }
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
  if (userId) {
    return createRecentDirectChatsSubscription({ userId, callback, limit });
  }

  let stopInner = () => undefined;
  const stopAuth = subscribeToAuthState(async (authUser) => {
    stopInner();
    if (!authUser?.uid) {
      callback([]);
      return;
    }
    stopInner = createRecentDirectChatsSubscription({ userId: authUser.uid, callback, limit });
  });

  return () => {
    stopInner();
    stopAuth();
  };
}

export async function markRecentDirectChatRead(userId, peerId) {
  if (!userId || !peerId) return;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  await update(ref(realtimeDb), {
    [`recentDirectChats/${userId}/${threadId}/unreadCount`]: 0,
    [`userChats/${userId}/${threadId}/unreadCount`]: 0
  }).catch(() => undefined);
}

export async function deleteRecentDirectChat({ userId, threadId }) {
  if (!userId || !threadId) return;
  const realtimeDb = getRealtimeDb();
  await update(ref(realtimeDb), {
    [`recentDirectChats/${userId}/${threadId}`]: null,
    [`userChats/${userId}/${threadId}`]: null
  });
}

export async function setRecentDirectChatArchived({ userId, threadId, archived }) {
  if (!userId || !threadId) return;
  const realtimeDb = getRealtimeDb();
  await update(ref(realtimeDb), {
    [`recentDirectChats/${userId}/${threadId}/archived`]: Boolean(archived),
    [`userChats/${userId}/${threadId}/archived`]: Boolean(archived)
  });
}

export async function setRecentDirectChatLocked({ userId, threadId, locked }) {
  if (!userId || !threadId) return;
  const realtimeDb = getRealtimeDb();
  await update(ref(realtimeDb), {
    [`recentDirectChats/${userId}/${threadId}/locked`]: Boolean(locked),
    [`userChats/${userId}/${threadId}/locked`]: Boolean(locked)
  });
}

export async function listDirectMessages(userId, peerId) {
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const threadRef = query(ref(realtimeDb, `dmMessages/${threadId}`), limitToLast(100));
  const [snap, hiddenSnap] = await Promise.all([
    get(threadRef),
    get(ref(realtimeDb, `hiddenDirectMessages/${userId}/${threadId}`))
  ]);
  if (!snap.exists()) return [];
  const raw = snap.val();
  const hiddenMap = hiddenSnap.exists() ? hiddenSnap.val() || {} : {};
  return Object.entries(raw)
    .filter(([id]) => !hiddenMap[id])
    .map(([id, value]) => mapDmMessage(id, value))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Export last N direct messages for the given thread.
 * Returned format is designed to be importable by `importDirectChatHistory`.
 */
export async function exportDirectChatHistory({ userId, peerId, limit = 100 }) {
  const realtimeDb = getRealtimeDb();
  const uid = String(userId || '').trim();
  const pid = String(peerId || '').trim();
  if (!uid || !pid) throw new Error('UserId and peerId are required.');

  const threadId = directThreadId(uid, pid);
  const safeLimit = Number(limit || 0);
  const threadRef = query(ref(realtimeDb, `dmMessages/${threadId}`), limitToLast(safeLimit || 100));

  const snap = await get(threadRef);
  const messages = [];
  if (snap.exists()) {
    const raw = snap.val() || {};
    messages.push(
      ...Object.entries(raw).map(([id, value]) => ({
        id,
        ...(value || {}),
        // keep sender/receiver explicit for validation during import
        senderId: String((value || {}).senderId || ''),
        receiverId: String((value || {}).receiverId || '')
      }))
    );
  }

  return {
    type: 'direct',
    version: 1,
    exportedAt: Date.now(),
    threadId,
    participants: [uid, pid],
    limit: safeLimit || 100,
    messages
  };
}

/**
 * Import a previously exported direct chat history.
 * Note: This restores messages into `dmMessages/${threadId}` and then refreshes indexes.
 *
 * Security note: We allow restoring only messages where `senderId` is either `userId` or `peerId`.
 * Receiver is re-derived from sender to prevent spoofing.
 */
export async function importDirectChatHistory({ userId, peerId, payload }) {
  const realtimeDb = getRealtimeDb();
  const uid = String(userId || '').trim();
  const pid = String(peerId || '').trim();
  if (!uid || !pid) throw new Error('UserId and peerId are required.');
  if (!payload || payload.type !== 'direct') throw new Error('Invalid direct chat payload.');

  const threadId = directThreadId(uid, pid);

  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  if (rawMessages.length === 0) throw new Error('No messages found in payload.');

  const allowedSenders = new Set([uid, pid]);
  const updates = {};
  const messagesForIndex = [];

  rawMessages.forEach((m) => {
    const messageId = String(m?.id || '').trim();
    const senderId = String(m?.senderId || '').trim();
    if (!messageId) return; // keep implementation simple and predictable for now
    if (!allowedSenders.has(senderId)) return; // prevent spoofing

    const expectedReceiverId = senderId === uid ? pid : uid;
    const createdAt = Number(m?.createdAt || m?.firebaseCreatedAt || Date.now());

    const valueToWrite = {
      senderId,
      receiverId: expectedReceiverId,
      content: String(m?.content || ''),
      mediaUrl: typeof m?.mediaUrl === 'string' ? m.mediaUrl : '',
      mediaType: String(m?.mediaType || ''),
      fileName: typeof m?.fileName === 'string' ? m.fileName : '',
      fileSize: Number(m?.fileSize || 0),
      contentType: typeof m?.contentType === 'string' ? m.contentType : '',
      createdAt,
      updatedAt: m?.updatedAt == null ? null : Number(m.updatedAt),
      isDeleted: Boolean(m?.isDeleted),
      deletedAt: m?.deletedAt == null ? null : Number(m.deletedAt),
      deletedBy: typeof m?.deletedBy === 'string' ? m.deletedBy : null,
      deliveredBy: m?.deliveredBy && typeof m.deliveredBy === 'object' ? m.deliveredBy : {},
      readBy: m?.readBy && typeof m.readBy === 'object' ? m.readBy : {},
      reactions: m?.reactions && typeof m.reactions === 'object' ? m.reactions : {}
    };

    updates[`dmMessages/${threadId}/${messageId}`] = valueToWrite;
    messagesForIndex.push(valueToWrite);
  });

  if (Object.keys(updates).length === 0) throw new Error('No valid messages to import (spoofed/invalid data).');

  await update(ref(realtimeDb), updates);

  // Refresh direct chat indexes so the thread shows up correctly in the dashboard.
  await syncRecentDirectChats({ realtimeDb, userId: uid, peerId: pid, threadId });

  return { ok: true, imported: messagesForIndex.length };
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
  const handleRemoved = (snap) => {
    if (!snap?.key) return;
    callback({ _id: snap.key, id: snap.key }, 'removed');
  };
  onChildAdded(threadRef, handleAdded);
  onChildChanged(threadRef, handleChanged);
  onChildRemoved(threadRef, handleRemoved);
  return () => {
    off(threadRef, 'child_added', handleAdded);
    off(threadRef, 'child_changed', handleChanged);
    off(threadRef, 'child_removed', handleRemoved);
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
  const participantA = userId;
  const participantB = peerId;

  await update(ref(realtimeDb), {
    [`recentDirectChats/${userId}/${threadId}/lastMessage`]: preview,
    [`recentDirectChats/${userId}/${threadId}/lastSenderId`]: lastSenderId,
    [`recentDirectChats/${userId}/${threadId}/updatedAt`]: updatedAt,
    [`recentDirectChats/${userId}/${threadId}/participants/${participantA}`]: true,
    [`recentDirectChats/${userId}/${threadId}/participants/${participantB}`]: true,
    [`recentDirectChats/${peerId}/${threadId}/lastMessage`]: preview,
    [`recentDirectChats/${peerId}/${threadId}/lastSenderId`]: lastSenderId,
    [`recentDirectChats/${peerId}/${threadId}/updatedAt`]: updatedAt,
    [`recentDirectChats/${peerId}/${threadId}/participants/${participantA}`]: true,
    [`recentDirectChats/${peerId}/${threadId}/participants/${participantB}`]: true,
    [`userChats/${userId}/${threadId}/lastMessage`]: preview,
    [`userChats/${userId}/${threadId}/lastSenderId`]: lastSenderId,
    [`userChats/${userId}/${threadId}/updatedAt`]: updatedAt,
    [`userChats/${userId}/${threadId}/participants/${participantA}`]: true,
    [`userChats/${userId}/${threadId}/participants/${participantB}`]: true,
    [`userChats/${peerId}/${threadId}/lastMessage`]: preview,
    [`userChats/${peerId}/${threadId}/lastSenderId`]: lastSenderId,
    [`userChats/${peerId}/${threadId}/updatedAt`]: updatedAt,
    [`userChats/${peerId}/${threadId}/participants/${participantA}`]: true,
    [`userChats/${peerId}/${threadId}/participants/${participantB}`]: true,
    [`directThreads/${threadId}/participants/${participantA}`]: true,
    [`directThreads/${threadId}/participants/${participantB}`]: true,
    [`directThreads/${threadId}/updatedAt`]: updatedAt
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
    const senderIndex = createDirectChatIndexEntry({
      ownerId: senderId,
      peerId: receiverId,
      lastMessage: content,
      lastSenderId: senderId,
      updatedAt: now,
      unreadCount: 0
    });
    const receiverIndex = createDirectChatIndexEntry({
      ownerId: receiverId,
      peerId: senderId,
      lastMessage: content,
      lastSenderId: senderId,
      updatedAt: now,
      unreadCount: 0
    });

    await update(ref(realtimeDb), {
      [`recentDirectChats/${senderId}/${threadId}`]: senderIndex,
      [`recentDirectChats/${receiverId}/${threadId}`]: receiverIndex,
      [`userChats/${senderId}/${threadId}`]: senderIndex,
      [`userChats/${receiverId}/${threadId}`]: receiverIndex,
      [`directThreads/${threadId}/participants/${senderId}`]: true,
      [`directThreads/${threadId}/participants/${receiverId}`]: true,
      [`directThreads/${threadId}/updatedAt`]: now
    });

    const unreadRef = ref(realtimeDb, `recentDirectChats/${receiverId}/${threadId}/unreadCount`);
    const unreadUserChatsRef = ref(realtimeDb, `userChats/${receiverId}/${threadId}/unreadCount`);
    const incrementUnread = (current) => {
      const safe = Number(current || 0);
      return safe + 1;
    };
    await Promise.all([runTransaction(unreadRef, incrementUnread), runTransaction(unreadUserChatsRef, incrementUnread)]);
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
  const isAudio = file.type.startsWith('audio/');
  const mediaType = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';

  const realtimeDb = getRealtimeDb();
  const storage = getFirebaseStorage();
  const threadId = directThreadId(senderId, receiverId);
  const now = Date.now();
  const node = push(ref(realtimeDb, `dmMessages/${threadId}`));
  const messageId = node.key;
  const extension = sanitizeStorageExtension(file.name.includes('.') ? file.name.split('.').pop() : '');
  const mediaRef = storageRef(
    storage,
    `dmMedia/${threadId}/${messageId}${extension ? `.${extension}` : ''}`
  );

  // FIX: retry upload/download for transient Storage failures.
  await withRetry(() => uploadBytes(mediaRef, file, { contentType: file.type || undefined }));
  const mediaUrl = await withRetry(() => getDownloadURL(mediaRef));

  await set(node, {
    senderId,
    receiverId,
    content: '',
    mediaUrl,
    mediaType,
    fileName: file.name || '',
    fileSize: Number(file.size || 0),
    contentType: file.type || '',
    createdAt: now
  });

  try {
    const messagePreview =
      mediaType === 'image' ? 'Photo' : mediaType === 'video' ? 'Video' : `File${file.name ? `: ${file.name}` : ''}`;
    const senderIndex = createDirectChatIndexEntry({
      ownerId: senderId,
      peerId: receiverId,
      lastMessage: messagePreview,
      lastSenderId: senderId,
      updatedAt: now,
      unreadCount: 0
    });
    const receiverIndex = createDirectChatIndexEntry({
      ownerId: receiverId,
      peerId: senderId,
      lastMessage: messagePreview,
      lastSenderId: senderId,
      updatedAt: now,
      unreadCount: 0
    });

    await update(ref(realtimeDb), {
      [`recentDirectChats/${senderId}/${threadId}`]: senderIndex,
      [`recentDirectChats/${receiverId}/${threadId}`]: receiverIndex,
      [`userChats/${senderId}/${threadId}`]: senderIndex,
      [`userChats/${receiverId}/${threadId}`]: receiverIndex,
      [`directThreads/${threadId}/participants/${senderId}`]: true,
      [`directThreads/${threadId}/participants/${receiverId}`]: true,
      [`directThreads/${threadId}/updatedAt`]: now
    });

    const unreadRef = ref(realtimeDb, `recentDirectChats/${receiverId}/${threadId}/unreadCount`);
    const unreadUserChatsRef = ref(realtimeDb, `userChats/${receiverId}/${threadId}/unreadCount`);
    const incrementUnread = (current) => {
      const safe = Number(current || 0);
      return safe + 1;
    };
    await Promise.all([runTransaction(unreadRef, incrementUnread), runTransaction(unreadUserChatsRef, incrementUnread)]);
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
  if (value.isDeleted) {
    await remove(messageRef);
    return;
  }
  const now = Date.now();
  await remove(messageRef);

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

/**
 * Export last N group messages for a groupId.
 */
export async function exportGroupChatHistory({ groupId, limit = 150 }) {
  const realtimeDb = getRealtimeDb();
  const gid = String(groupId || '').trim();
  if (!gid) throw new Error('groupId is required.');

  const safeLimit = Number(limit || 0);
  const groupMessagesRef = query(ref(realtimeDb, `groupMessages/${gid}`), limitToLast(safeLimit || 150));

  const [messagesSnap, groupSnap] = await Promise.all([get(groupMessagesRef), get(ref(realtimeDb, `groups/${gid}`))]);
  const messages = [];
  if (messagesSnap.exists()) {
    const raw = messagesSnap.val() || {};
    messages.push(
      ...Object.entries(raw).map(([id, value]) => ({
        id,
        ...(value || {}),
        senderId: String((value || {}).senderId || ''),
        message: String((value || {}).message || '')
      }))
    );
  }

  return {
    type: 'group',
    version: 1,
    exportedAt: Date.now(),
    groupId: gid,
    group: groupSnap.exists() ? groupSnap.val() : null,
    limit: safeLimit || 150,
    messages
  };
}

/**
 * Import a previously exported group chat history into `groupMessages/${groupId}`.
 * Security: Only group members can import. Sender spoofing is allowed (historical messages),
 * but groupId is enforced by the target path.
 */
export async function importGroupChatHistory({ groupId, userId, payload }) {
  const realtimeDb = getRealtimeDb();
  const gid = String(groupId || '').trim();
  const uid = String(userId || '').trim();
  if (!gid || !uid) throw new Error('groupId and userId are required.');
  if (!payload || payload.type !== 'group') throw new Error('Invalid group chat payload.');

  const membershipSnap = await get(ref(realtimeDb, `groups/${gid}/members/${uid}`));
  if (!membershipSnap.exists() || !membershipSnap.val()) throw new Error('You are not a member of this group.');

  const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];
  if (rawMessages.length === 0) throw new Error('No messages found in payload.');

  const updates = {};
  let importedCount = 0;

  rawMessages.forEach((m) => {
    const messageId = String(m?.id || '').trim();
    if (!messageId) return;

    const senderId = String(m?.senderId || '').trim();
    if (!senderId) return;

    const createdAt = Number(m?.createdAt || m?.firebaseCreatedAt || Date.now());
    const messageValue = String(m?.message ?? m?.content ?? '');

    updates[`groupMessages/${gid}/${messageId}`] = {
      groupId: gid,
      senderId,
      message: messageValue,
      createdAt,
      deliveredBy: m?.deliveredBy && typeof m.deliveredBy === 'object' ? m.deliveredBy : {},
      readBy: m?.readBy && typeof m.readBy === 'object' ? m.readBy : {},
      reactions: m?.reactions && typeof m.reactions === 'object' ? m.reactions : {}
    };
    importedCount += 1;
  });

  if (Object.keys(updates).length === 0) throw new Error('No valid messages to import.');

  await update(ref(realtimeDb), updates);
  await update(ref(realtimeDb), { [`groups/${gid}/updatedAt`]: Date.now() });

  return { ok: true, imported: importedCount };
}

export function subscribeGroupMessages(groupId, callback) {
  const realtimeDb = getRealtimeDb();
  const groupRef = query(ref(realtimeDb, `groupMessages/${groupId}`), limitToLast(150));
  const handleAdded = (snap) => {
    if (!snap.exists()) return;
    callback(mapGroupMessage(snap.key, snap.val()), 'added');
  };
  const handleChanged = (snap) => {
    if (!snap.exists()) return;
    callback(mapGroupMessage(snap.key, snap.val()), 'changed');
  };
  onChildAdded(groupRef, handleAdded);
  onChildChanged(groupRef, handleChanged);
  return () => {
    off(groupRef, 'child_added', handleAdded);
    off(groupRef, 'child_changed', handleChanged);
  };
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

export async function leaveGroupMembership({ groupId, userId }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !userId) {
    throw new Error('Group ID and user are required.');
  }
  const realtimeDb = getRealtimeDb();

  // FIX: Avoid leaving the group if the user is the last admin.
  const groupSnap = await get(ref(realtimeDb, `groups/${normalizedGroupId}`));
  if (!groupSnap.exists()) throw new Error('Group not found.');
  const groupValue = groupSnap.val() || {};
  const members = groupValue.members || {};
  const createdBy = groupValue.createdBy || null;

  const currentMembership = members[userId];
  if (!currentMembership) return;

  const myRole = getGroupMemberRole(currentMembership);
  const myIsAdmin = myRole === 'admin' || (createdBy && createdBy === userId);

  const adminIds = Object.keys(members).filter((id) => {
    const r = getGroupMemberRole(members[id]);
    return r === 'admin' || (createdBy && createdBy === id);
  });
  const willBeLastAdmin = myIsAdmin && adminIds.length <= 1;
  if (willBeLastAdmin) {
    throw new Error('You cannot leave while you are the last admin. Assign another admin first.');
  }

  await update(ref(realtimeDb), {
    [`groups/${normalizedGroupId}/members/${userId}`]: null,
    [`groups/${normalizedGroupId}/updatedAt`]: Date.now(),
    [`groupPrefs/${userId}/${normalizedGroupId}/muted`]: null
  });

  // Transfer createdBy if needed.
  if (createdBy && createdBy === userId) {
    const nextAdmin = adminIds.filter((id) => id !== userId)[0];
    if (nextAdmin) {
      await update(ref(realtimeDb), {
        [`groups/${normalizedGroupId}/createdBy`]: nextAdmin,
        [`groups/${normalizedGroupId}/updatedAt`]: Date.now()
      });
    }
  }
}

export async function setGroupMuted({ groupId, userId, muted }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !userId) {
    throw new Error('Group ID and user are required.');
  }
  const realtimeDb = getRealtimeDb();
  await update(ref(realtimeDb), {
    [`groupPrefs/${userId}/${normalizedGroupId}/muted`]: Boolean(muted)
  });
}

export async function removeGroupMember({ groupId, actorId, memberId }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !actorId || !memberId) {
    throw new Error('Group ID, actor, and member are required.');
  }
  const realtimeDb = getRealtimeDb();

  // FIX: Enforce admin-only removal with backward compatible membership shapes.
  const groupSnap = await get(ref(realtimeDb, `groups/${normalizedGroupId}`));
  if (!groupSnap.exists()) throw new Error('Group not found.');
  const groupValue = groupSnap.val() || {};
  const members = groupValue.members || {};
  const createdBy = groupValue.createdBy || null;

  const actorMembership = members[actorId];
  if (!actorMembership) throw new Error('Only group members can remove users.');

  const actorRole = getGroupMemberRole(actorMembership);
  const actorIsAdmin = actorRole === 'admin' || (createdBy && createdBy === actorId);
  if (!actorIsAdmin) throw new Error('Only admins can remove members.');

  const targetMembership = members[memberId];
  if (!targetMembership) throw new Error('Member is not in this group.');

  // Prevent removing the last admin.
  const adminIds = Object.keys(members).filter((id) => {
    const r = getGroupMemberRole(members[id]);
    return r === 'admin' || (createdBy && createdBy === id);
  });
  const targetIsAdmin = adminIds.includes(memberId);
  const remainingAdminCount = targetIsAdmin ? adminIds.length - 1 : adminIds.length;
  if (targetIsAdmin && remainingAdminCount <= 0) {
    throw new Error('You cannot remove the last admin. Assign another admin first.');
  }

  await update(ref(realtimeDb), {
    [`groups/${normalizedGroupId}/members/${memberId}`]: null,
    [`groups/${normalizedGroupId}/updatedAt`]: Date.now(),
    [`groupPrefs/${memberId}/${normalizedGroupId}/muted`]: null
  });

  // If creator/admin removed, transfer `createdBy` to any remaining admin for legacy compatibility.
  if (createdBy && createdBy === memberId) {
    const nextAdmin = adminIds.filter((id) => id !== memberId)[0];
    if (nextAdmin) {
      await update(ref(realtimeDb), {
        [`groups/${normalizedGroupId}/createdBy`]: nextAdmin,
        [`groups/${normalizedGroupId}/updatedAt`]: Date.now()
      });
    }
  }
}

export async function setGroupMemberRole({ groupId, actorId, memberId, role }) {
  const normalizedGroupId = String(groupId || '').trim();
  const normalizedRole = role === 'admin' ? 'admin' : 'member';
  if (!normalizedGroupId || !actorId || !memberId) {
    throw new Error('Group ID, actor, and member are required.');
  }

  if (normalizedRole !== 'admin' && normalizedRole !== 'member') {
    throw new Error('Invalid role.');
  }

  const realtimeDb = getRealtimeDb();
  const groupSnap = await get(ref(realtimeDb, `groups/${normalizedGroupId}`));
  if (!groupSnap.exists()) throw new Error('Group not found.');

  const groupValue = groupSnap.val() || {};
  const members = groupValue.members || {};
  const createdBy = groupValue.createdBy || null;

  const actorMembership = members[actorId];
  if (!actorMembership) throw new Error('Only group members can assign roles.');

  const actorRole = getGroupMemberRole(actorMembership);
  const actorIsAdmin = actorRole === 'admin' || (createdBy && createdBy === actorId);
  if (!actorIsAdmin) throw new Error('Only admins can assign new admins.');

  if (!members[memberId]) throw new Error('Member is not in this group.');

  if (normalizedRole === 'member') {
    // Prevent demoting the last admin.
    const adminIds = Object.keys(members).filter((id) => {
      const r = getGroupMemberRole(members[id]);
      return r === 'admin' || (createdBy && createdBy === id);
    });
    const targetIsAdmin = adminIds.includes(memberId);
    const remainingAdminCount = targetIsAdmin ? adminIds.length - 1 : adminIds.length;
    if (targetIsAdmin && remainingAdminCount <= 0) {
      throw new Error('You cannot demote the last admin.');
    }
  }

  await update(ref(realtimeDb), {
    [`groups/${normalizedGroupId}/members/${memberId}`]: { role: normalizedRole },
    [`groups/${normalizedGroupId}/updatedAt`]: Date.now()
  });
}

export async function setGroupPhoto({ groupId, actorId, file }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !actorId || !file) {
    throw new Error('Group ID, actor, and photo file are required.');
  }
  const realtimeDb = getRealtimeDb();
  const membershipSnap = await get(ref(realtimeDb, `groups/${normalizedGroupId}/members/${actorId}`));
  if (!membershipSnap.exists() || !membershipSnap.val()) {
    throw new Error('Only group members can change group photo.');
  }

  const storage = getFirebaseStorage();
  const extension = sanitizeStorageExtension(file.name.includes('.') ? file.name.split('.').pop() : '');
  const photoRef = storageRef(storage, `groupPhotos/${normalizedGroupId}/avatar${extension ? `.${extension}` : ''}`);
  // FIX: retry upload/download for transient Storage failures.
  await withRetry(() => uploadBytes(photoRef, file, { contentType: file.type || undefined }));
  const photoUrl = await withRetry(() => getDownloadURL(photoRef));

  await update(ref(realtimeDb), {
    [`groups/${normalizedGroupId}/photoUrl`]: photoUrl,
    [`groups/${normalizedGroupId}/photoUpdatedAt`]: Date.now(),
    [`groups/${normalizedGroupId}/updatedAt`]: Date.now()
  });

  return photoUrl;
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

export async function hideDirectMessageForMe({ userId, peerId, messageId }) {
  if (!userId || !peerId || !messageId) {
    throw new Error('Missing hide message parameters.');
  }
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  await set(ref(realtimeDb, `hiddenDirectMessages/${userId}/${threadId}/${messageId}`), true);
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

// ===== REACTIONS =====

export async function toggleDmReaction({ userId, peerId, messageId, emoji }) {
  if (!userId || !peerId || !messageId || !emoji) return;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const reactionRef = ref(realtimeDb, `dmMessages/${threadId}/${messageId}/reactions/${emoji}/${userId}`);
  const snap = await get(reactionRef);
  if (snap.exists()) {
    await remove(reactionRef);
  } else {
    await set(reactionRef, true);
  }
}

export async function toggleGroupReaction({ groupId, userId, messageId, emoji }) {
  if (!groupId || !userId || !messageId || !emoji) return;
  const normalizedGroupId = String(groupId || '').trim();
  const realtimeDb = getRealtimeDb();
  const reactionRef = ref(realtimeDb, `groupMessages/${normalizedGroupId}/${messageId}/reactions/${emoji}/${userId}`);
  const snap = await get(reactionRef);
  if (snap.exists()) {
    await remove(reactionRef);
  } else {
    await set(reactionRef, true);
  }
}

// ===== TYPING INDICATORS =====

export async function setDmTyping({ userId, peerId, username, isTyping }) {
  if (!userId || !peerId) return;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const typingRef = ref(realtimeDb, `dmTyping/${threadId}/${userId}`);
  if (isTyping) {
    await set(typingRef, { username: username || 'User', updatedAt: Date.now() });
  } else {
    await remove(typingRef);
  }
}

export function subscribeDmTyping(userId, peerId, currentUserId, callback) {
  if (!userId || !peerId) return () => undefined;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const typingRef = ref(realtimeDb, `dmTyping/${threadId}`);
  const listener = (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const val = snap.val() || {};
    const typers = Object.entries(val)
      .filter(([uid]) => uid !== currentUserId)
      .filter(([, v]) => Date.now() - Number(v.updatedAt || 0) < 5000)
      .map(([, v]) => v.username || 'User');
    callback(typers);
  };
  onValue(typingRef, listener);
  return () => off(typingRef, 'value', listener);
}

export async function setGroupTyping({ groupId, userId, username, isTyping }) {
  if (!groupId || !userId) return;
  const normalizedGroupId = String(groupId || '').trim();
  const realtimeDb = getRealtimeDb();
  const typingRef = ref(realtimeDb, `groupTyping/${normalizedGroupId}/${userId}`);
  if (isTyping) {
    await set(typingRef, { username: username || 'User', updatedAt: Date.now() });
  } else {
    await remove(typingRef);
  }
}

export function subscribeGroupTyping(groupId, currentUserId, callback) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) return () => undefined;
  const realtimeDb = getRealtimeDb();
  const typingRef = ref(realtimeDb, `groupTyping/${normalizedGroupId}`);
  const listener = (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const val = snap.val() || {};
    const typers = Object.entries(val)
      .filter(([uid]) => uid !== currentUserId)
      .filter(([, v]) => Date.now() - Number(v.updatedAt || 0) < 5000)
      .map(([, v]) => v.username || 'User');
    callback(typers);
  };
  onValue(typingRef, listener);
  return () => off(typingRef, 'value', listener);
}

// ===== MESSAGE PINNING =====

export async function pinDmMessage({ userId, peerId, messageId, content }) {
  if (!userId || !peerId || !messageId) return;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  await update(ref(realtimeDb, `dmPins/${threadId}/${messageId}`), {
    messageId,
    content: content || '',
    pinnedBy: userId,
    pinnedAt: Date.now()
  });
}

export async function unpinDmMessage({ userId, peerId, messageId }) {
  if (!userId || !peerId || !messageId) return;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  await remove(ref(realtimeDb, `dmPins/${threadId}/${messageId}`));
}

export function subscribePinnedDmMessages(userId, peerId, callback) {
  if (!userId || !peerId) return () => undefined;
  const realtimeDb = getRealtimeDb();
  const threadId = directThreadId(userId, peerId);
  const pinsRef = ref(realtimeDb, `dmPins/${threadId}`);
  const listener = (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const val = snap.val() || {};
    const pins = Object.values(val).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
    callback(pins);
  };
  onValue(pinsRef, listener);
  return () => off(pinsRef, 'value', listener);
}

export async function pinGroupMessage({ groupId, userId, messageId, content }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !userId || !messageId) return;
  const realtimeDb = getRealtimeDb();
  await update(ref(realtimeDb, `groupPins/${normalizedGroupId}/${messageId}`), {
    messageId,
    content: content || '',
    pinnedBy: userId,
    pinnedAt: Date.now()
  });
}

export async function unpinGroupMessage({ groupId, messageId }) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId || !messageId) return;
  const realtimeDb = getRealtimeDb();
  await remove(ref(realtimeDb, `groupPins/${normalizedGroupId}/${messageId}`));
}

export function subscribePinnedGroupMessages(groupId, callback) {
  const normalizedGroupId = String(groupId || '').trim();
  if (!normalizedGroupId) return () => undefined;
  const realtimeDb = getRealtimeDb();
  const pinsRef = ref(realtimeDb, `groupPins/${normalizedGroupId}`);
  const listener = (snap) => {
    if (!snap.exists()) {
      callback([]);
      return;
    }
    const val = snap.val() || {};
    const pins = Object.values(val).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
    callback(pins);
  };
  onValue(pinsRef, listener);
  return () => off(pinsRef, 'value', listener);
}
