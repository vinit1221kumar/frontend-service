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
import { initializeMyPresence } from '../services/firebaseChat';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(null);
  const stopPresenceRef = useRef(() => undefined);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState(async (authUser) => {
      try {
        stopPresenceRef.current();
        const snapshot = await getCurrentAuthSnapshot(authUser);
        setToken(snapshot.token);
        setUser(snapshot.user);
        if (snapshot.user?.id) {
          stopPresenceRef.current = initializeMyPresence(snapshot.user.id);
        } else {
          stopPresenceRef.current = () => undefined;
        }
      } finally {
        setLoading(false);
      }
    });

    return () => {
      stopPresenceRef.current();
      unsubscribe();
    };
  }, []);

  const login = async (email, password) => {
    const snapshot = await loginWithFirebase({ email, password });
    setToken(snapshot.token);
    setUser(snapshot.user);
  };

  const loginWithGoogle = async () => {
    const snapshot = await loginWithGoogleFirebase();
    setToken(snapshot.token);
    setUser(snapshot.user);
  };

  const register = async (username, email, password) => {
    const snapshot = await registerWithFirebase({ username, email, password });
    setToken(snapshot.token);
    setUser(snapshot.user);
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

