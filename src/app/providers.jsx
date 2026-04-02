'use client';

import { ThemeProvider } from '@/context/ThemeContext';
import { AuthProvider } from '@/context/AuthContext';
import { SocketProvider } from '@/context/SocketContext';
import { IncomingCallProvider } from '@/context/IncomingCallContext';
import IncomingCallOverlay from '@/components/IncomingCallOverlay';

export function Providers({ children }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <IncomingCallProvider>
            <IncomingCallOverlay />
            {children}
          </IncomingCallProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
