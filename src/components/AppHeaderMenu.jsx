'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/hooks/useAuth';
import { AppLogo } from '@/components/AppLogo';

/**
 * Theme toggle + round Home icon + ⋮ menu (Instagram-style).
 * @param {object} props
 * @param {boolean} [props.showHomeButton=true] — round icon link to /
 * @param {{ href: string, label: string, icon: import('lucide-react').LucideIcon }[]} [props.menuLinks=[]] — items above Log out
 * @param {boolean} [props.showLogout=true]
 */
export function AppHeaderMenu({ showHomeButton = true, menuLinks = [], showLogout = true }) {
  const { logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const hasMenuBody = menuLinks.length > 0 || showLogout;

  return (
    <div className="flex items-center gap-1.5">
      <ThemeToggle />
      {showHomeButton && (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="rounded-full p-0 hover:bg-transparent focus-visible:ring-2 focus-visible:ring-amber-500/55 dark:focus-visible:ring-sky-400/45"
          title="Home"
          aria-label="Home"
        >
          <Link href="/" onClick={() => setMenuOpen(false)}>
            <AppLogo variant="mark" className="h-9 w-9" />
          </Link>
        </Button>
      )}
      {hasMenuBody && (
        <div ref={menuRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="Open menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
          {menuOpen && (
            <div
              role="menu"
              className="anim-pop absolute right-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-2xl border border-amber-200/90 bg-white py-1.5 shadow-xl shadow-amber-900/10 dark:border-navy-700/60 dark:bg-navy-950 dark:shadow-black/40"
            >
              {menuLinks.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href + label}
                  href={href}
                  role="menuitem"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-amber-950 no-underline transition-colors duration-150 hover:bg-amber-100 dark:text-slate-50 dark:hover:bg-navy-800/60"
                  onClick={() => setMenuOpen(false)}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0 opacity-80" />}
                  {label}
                </Link>
              ))}
              {showLogout && (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }}
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Log out
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
