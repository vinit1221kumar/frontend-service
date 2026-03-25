'use client';

import React, { createContext, useContext } from 'react';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  return <SocketContext.Provider value={{ socket: null }}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

