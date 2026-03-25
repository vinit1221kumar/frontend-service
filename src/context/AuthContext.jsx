'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  getCurrentAuthSnapshot,
  loginWithGoogleFirebase,
  loginWithFirebase,
  logoutFromFirebase,
  registerWithFirebase,
  subscribeToAuthState
} from '../services/firebaseAuth';
import { setMyPresence } from '../services/firebaseChat';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (authUser) => {
      try {
        const snapshot = await getCurrentAuthSnapshot(authUser);
        setToken(snapshot.token);
        setUser(snapshot.user);
        if (snapshot.user?.id) {
          await setMyPresence(snapshot.user.id, true);
        }
      } finally {
        setLoading(false);
      }
    });

    const onUnload = () => {
      if (userRef.current?.id) {
        setMyPresence(userRef.current.id, false).catch(() => undefined);
      }
    };

    window.addEventListener('beforeunload', onUnload);

    return () => {
      window.removeEventListener('beforeunload', onUnload);
      unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    const snapshot = await loginWithFirebase({ email, password });
    setToken(snapshot.token);
    setUser(snapshot.user);
    if (snapshot.user?.id) {
      await setMyPresence(snapshot.user.id, true);
    }
  };

  const loginWithGoogle = async () => {
    const snapshot = await loginWithGoogleFirebase();
    setToken(snapshot.token);
    setUser(snapshot.user);
    if (snapshot.user?.id) {
      await setMyPresence(snapshot.user.id, true);
    }
  };

  const register = async (username, email, password) => {
    const snapshot = await registerWithFirebase({ username, email, password });
    setToken(snapshot.token);
    setUser(snapshot.user);
    if (snapshot.user?.id) {
      await setMyPresence(snapshot.user.id, true);
    }
  };

  const logout = async () => {
    await logoutFromFirebase();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        login,
        loginWithGoogle,
        register,
        logout,
        isAuthenticated: !!token,
        loading
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

