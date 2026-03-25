import { get, limitToLast, off, onChildAdded, onValue, push, query, ref, set, update } from 'firebase/database';
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
  const node = push(ref(realtimeDb, `dmMessages/${threadId}`));
  await set(node, {
    senderId,
    receiverId,
    content,
    createdAt: Date.now()
  });
  return node.key;
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
  const node = push(ref(realtimeDb, `groupMessages/${groupId}`));
  await set(node, {
    groupId,
    senderId,
    message,
    createdAt: Date.now()
  });
  return node.key;
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
