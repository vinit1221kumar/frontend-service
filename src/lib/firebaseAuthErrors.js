export function toFirebaseAuthMessage(error, mode = 'generic') {
  const code = error?.code || '';

  if (code === 'auth/firebase-not-configured') {
    return 'Firebase credentials are not configured. Frontend can run, but authentication is disabled until NEXT_PUBLIC_FIREBASE_* values are set.';
  }

  if (code === 'auth/invalid-api-key') {
    return 'Firebase config is missing or invalid. Fill NEXT_PUBLIC_FIREBASE_* values in .env.development.local and restart the dev server.';
  }

  if (code === 'auth/operation-not-allowed') {
    return 'Google sign-in is disabled. Enable Google provider in Firebase Console → Authentication → Sign-in method.';
  }

  if (code === 'auth/unauthorized-domain') {
    return 'This domain is not authorized for Firebase Auth. Add your domain in Firebase Console → Authentication → Settings → Authorized domains.';
  }

  if (code === 'auth/popup-blocked') {
    return 'Popup was blocked by the browser. Allow popups for this site and try again.';
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Google sign-in popup was closed before completing authentication.';
  }

  if (code === 'auth/cancelled-popup-request') {
    return 'Google sign-in popup request was cancelled. Try again.';
  }

  if (code === 'auth/network-request-failed') {
    return 'Network error while contacting Firebase. Check your internet connection and try again.';
  }

  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    if (mode === 'login') {
      return 'Invalid email or password.';
    }
    return 'Authentication failed. Please check your credentials.';
  }

  if (code === 'auth/email-already-in-use') {
    return 'This email is already registered. Try logging in instead.';
  }

  if (code === 'auth/weak-password') {
    return 'Password is too weak. Use at least 6 characters.';
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a bit and try again.';
  }

  if (mode === 'google') {
    return 'Google sign-in failed. Please try again.';
  }

  if (mode === 'register') {
    return 'Registration failed. Please try again.';
  }

  if (mode === 'login') {
    return 'Login failed. Please try again.';
  }

  return 'Authentication failed. Please try again.';
}
