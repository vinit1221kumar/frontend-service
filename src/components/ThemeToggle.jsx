'use client';

import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle({ className = '' }) {
  const { mode, setMode, resolved } = useTheme();

  /** One click = light ↔ dark only (no system step, so it always flips visibly). */
  const toggle = () => {
    if (mode === 'system') {
      setMode(resolved === 'dark' ? 'light' : 'dark');
    } else {
      setMode(mode === 'light' ? 'dark' : 'light');
    }
  };

  const Icon = resolved === 'dark' ? Moon : Sun;
  const label =
    resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme (navy blue)';

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className={className}
      onClick={toggle}
      title={label}
      aria-label={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
