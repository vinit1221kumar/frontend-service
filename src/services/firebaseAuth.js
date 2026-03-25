import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import { get, ref, set, update } from 'firebase/database';
import { getFirebaseAuth, getRealtimeDb } from './firebaseClient';

function toProfile(authUser, profile = {}) {
  const username = profile.username || authUser.displayName || authUser.email?.split('@')[0] || 'User';
  return {
    id: authUser.uid,
    uid: authUser.uid,
    email: authUser.email || '',
    username
  };
}

async function ensureUserProfile({ realtimeDb, user, fallbackEmail, fallbackUsername }) {
  const profileRef = ref(realtimeDb, `users/${user.uid}`);
  const profileSnap = await get(profileRef);
  if (profileSnap.exists()) {
    return profileSnap.val();
  }
  const profile = {
    uid: user.uid,
    username: fallbackUsername || user.displayName || user.email?.split('@')[0] || 'User',
    email: fallbackEmail || user.email || '',
    createdAt: Date.now()
  };
  await set(profileRef, profile);
  return profile;
}

export async function registerWithFirebase({ username, email, password }) {
  const firebaseAuth = getFirebaseAuth();
  const realtimeDb = getRealtimeDb();
  const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  if (username) {
    await updateProfile(credential.user, { displayName: username });
  }
  const profile = await ensureUserProfile({
    realtimeDb,
    user: credential.user,
    fallbackEmail: email,
    fallbackUsername: username
  });
  const token = await credential.user.getIdToken();
  return {
    token,
    user: toProfile(credential.user, profile)
  };
}

export async function loginWithFirebase({ email, password }) {
  const firebaseAuth = getFirebaseAuth();
  const realtimeDb = getRealtimeDb();
  const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
  const profile = await ensureUserProfile({
    realtimeDb,
    user: credential.user,
    fallbackEmail: email
  });
  const token = await credential.user.getIdToken();
  return {
    token,
    user: toProfile(credential.user, profile || undefined)
  };
}

export async function loginWithGoogleFirebase() {
  const firebaseAuth = getFirebaseAuth();
  const realtimeDb = getRealtimeDb();
  const provider = new GoogleAuthProvider();
  const credential = await signInWithPopup(firebaseAuth, provider);
  const profile = await ensureUserProfile({
    realtimeDb,
    user: credential.user
  });
  const token = await credential.user.getIdToken();
  return {
    token,
    user: toProfile(credential.user, profile)
  };
}

export async function logoutFromFirebase() {
  const firebaseAuth = getFirebaseAuth();
  const realtimeDb = getRealtimeDb();
  const current = firebaseAuth.currentUser;
  if (current) {
    await update(ref(realtimeDb, `presence/${current.uid}`), {
      online: false,
      lastSeen: Date.now()
    });
  }
  await signOut(firebaseAuth);
}

export async function getCurrentAuthSnapshot(authUser) {
  const realtimeDb = getRealtimeDb();
  if (!authUser) {
    return { token: null, user: null };
  }
  const [token, profileSnap] = await Promise.all([
    authUser.getIdToken(),
    get(ref(realtimeDb, `users/${authUser.uid}`))
  ]);
  const profile = profileSnap.exists() ? profileSnap.val() : {};
  return {
    token,
    user: toProfile(authUser, profile)
  };
}

export function subscribeToAuthState(handler) {
  const firebaseAuth = getFirebaseAuth();
  return onAuthStateChanged(firebaseAuth, handler);
}
