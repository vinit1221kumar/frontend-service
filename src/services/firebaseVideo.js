import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { getFirestoreDb } from './firebaseClient';

function roomDoc(roomId) {
  return doc(getFirestoreDb(), 'videoRooms', roomId);
}

function signalsCollection(roomId) {
  return collection(getFirestoreDb(), 'videoRooms', roomId, 'signals');
}

export async function joinVideoRoom({ roomId, userId }) {
  const roomRef = roomDoc(roomId);
  const existing = await getDoc(roomRef);
  let role = 'callee';

  if (!existing.exists()) {
    await setDoc(roomRef, {
      createdBy: userId,
      createdAt: serverTimestamp(),
      participants: { [userId]: true }
    });
    role = 'caller';
  } else {
    const data = existing.data() || {};
    role = data.createdBy === userId ? 'caller' : 'callee';
    await setDoc(
      roomRef,
      {
        participants: {
          ...(data.participants || {}),
          [userId]: true
        },
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }

  return { role };
}

export async function leaveVideoRoom({ roomId, userId }) {
  const roomRef = roomDoc(roomId);
  await updateDoc(roomRef, {
    [`participants.${userId}`]: deleteField(),
    updatedAt: serverTimestamp()
  }).catch(() => undefined);
}

export async function sendVideoSignal({ roomId, signal, fromUserId }) {
  await addDoc(signalsCollection(roomId), {
    fromUserId,
    ...signal,
    createdAt: serverTimestamp()
  });
}

export function subscribeToVideoSignals({ roomId, onSignal }) {
  const q = query(signalsCollection(roomId), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type !== 'added') return;
      onSignal({ id: change.doc.id, ...change.doc.data() });
    });
  });
}

export function subscribeToRoomPresence({ roomId, onPeerLeft, currentUserId }) {
  let hadPeer = false;
  return onSnapshot(roomDoc(roomId), (snap) => {
    if (!snap.exists()) return;
    const participants = snap.data()?.participants || {};
    const others = Object.keys(participants).filter((id) => id !== currentUserId);
    if (others.length > 0) {
      hadPeer = true;
      return;
    }
    if (hadPeer && others.length === 0) {
      onPeerLeft();
    }
  });
}
