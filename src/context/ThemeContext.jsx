'use client';

import React, { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'd-lite-theme';

const ThemeContext = createContext(null);

function getSystemDark() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveDarkClass(mode) {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return getSystemDark();
}

export function ThemeProvider({ children }) {
  // SSR + first client render must match — never read localStorage in useState initialiser
  // (server defaults to 'dark', client with saved 'light' would mismatch → hydration error).
  const [mode, setModeState] = useState('dark');
  const hasSyncedFromStorage = useRef(false);

  useLayoutEffect(() => {
    // Before paint: read saved theme once, then apply to DOM + persist — without overwriting
    // localStorage with the default 'dark' on the first layout pass.
    if (!hasSyncedFromStorage.current) {
      hasSyncedFromStorage.current = true;
      try {
        const s = localStorage.getItem(STORAGE_KEY);
        if (s === 'light' || s === 'dark' || s === 'system') {
          setModeState(s);
          return;
        }
      } catch {
        /* ignore */
      }
    }

    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    const dark = resolveDarkClass(mode);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [mode]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const dark = mq.matches;
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = (next) => setModeState(next);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      /** Effective theme for UI labels */
      resolved: resolveDarkClass(mode) ? 'dark' : 'light'
    }),
    [mode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
