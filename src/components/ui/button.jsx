'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold transition duration-200 ease-out motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/55 dark:focus-visible:ring-sky-400/45 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        default:
          'bg-amber-600 text-amber-50 hover:bg-amber-500 shadow-[0_10px_35px_-18px_rgba(217,119,6,0.5)] dark:bg-sky-600 dark:text-white dark:hover:bg-sky-500 dark:shadow-[0_10px_35px_-18px_rgba(14,165,233,0.35)]',
        secondary:
          'border border-amber-300/90 bg-amber-100/90 text-amber-950 hover:bg-amber-200/90 dark:border-navy-600/60 dark:bg-navy-950/50 dark:text-slate-100 dark:hover:bg-navy-800/60',
        ghost:
          'text-amber-900 hover:bg-amber-100/90 dark:text-slate-100 dark:hover:bg-navy-800/40',
        destructive: 'bg-red-600 text-white hover:bg-red-500'
      },
      size: {
        default: 'h-10 px-4 py-2.5',
        sm: 'h-9 rounded-lg px-3',
        lg: 'h-11 px-5',
        icon: 'h-10 w-10'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = 'Button';

export { Button, buttonVariants };
