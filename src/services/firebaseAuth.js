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
import { createFirebaseConfigError, getFirebaseAuth, getRealtimeDb, isFirebaseConfigured } from './firebaseClient';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function toProfile(authUser, profile = {}) {
  const username = profile.username || authUser.displayName || authUser.email?.split('@')[0] || 'User';
  return {
    id: authUser.uid,
    uid: authUser.uid,
    email: authUser.email || '',
    username,
    // FIX: ensure photoURL is carried through auth snapshot to avoid mismatched avatars.
    // Backward compatible: if missing, consumers should fallback.
    photoURL: profile.photoURL || ''
  };
}

async function ensureUserProfile({ realtimeDb, user, fallbackEmail, fallbackUsername }) {
  const profileRef = ref(realtimeDb, `users/${user.uid}`);
  const profileSnap = await get(profileRef);
  if (profileSnap.exists()) {
    const existing = profileSnap.val() || {};
    const existingUsername = existing.username || user.displayName || user.email?.split('@')[0] || 'User';
    const expectedLower = normalizeUsername(existingUsername);

    // FIX: Backfill normalized username for user search (case-insensitive prefix search).
    if (existing.usernameLower !== expectedLower) {
      try {
        await update(profileRef, { usernameLower: expectedLower });
      } catch {
        // Best-effort; don't block login if profile normalization fails.
      }
    }
    return { ...existing, username: existingUsername, usernameLower: expectedLower };
  }
  const profile = {
    uid: user.uid,
    username: fallbackUsername || user.displayName || user.email?.split('@')[0] || 'User',
    usernameLower: normalizeUsername(fallbackUsername || user.displayName || user.email?.split('@')[0] || 'User'),
    email: fallbackEmail || user.email || '',
    // FIX: store photoURL in the canonical profile location for consistent reads across app.
    photoURL: user.photoURL || '',
    createdAt: Date.now()
  };
  await set(profileRef, profile);
  return profile;
}

export async function registerWithFirebase({ username, email, password }) {
  if (!isFirebaseConfigured()) {
    throw createFirebaseConfigError();
  }
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
  if (!isFirebaseConfigured()) {
    throw createFirebaseConfigError();
  }
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
  if (!isFirebaseConfigured()) {
    throw createFirebaseConfigError();
  }
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
  if (!isFirebaseConfigured()) {
    return;
  }
  const firebaseAuth = getFirebaseAuth();
  const realtimeDb = getRealtimeDb();
  const current = firebaseAuth.currentUser;
  if (current) {
    try {
      await update(ref(realtimeDb, `presence/${current.uid}`), {
        online: false,
        lastSeen: Date.now()
      });
    } catch {
      /* presence update is best-effort; continue sign-out */
    }
  }
  await signOut(firebaseAuth);
}

export async function getCurrentAuthSnapshot(authUser) {
  if (!authUser) {
    return { token: null, user: null };
  }
  if (!isFirebaseConfigured()) {
    return { token: null, user: null };
  }
  const realtimeDb = getRealtimeDb();
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
  if (!isFirebaseConfigured()) {
    handler(null);
    return () => undefined;
  }
  const firebaseAuth = getFirebaseAuth();
  return onAuthStateChanged(firebaseAuth, handler);
}
