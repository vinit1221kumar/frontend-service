declare module '@/components/ui/button' {
  import * as React from 'react';

  export type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'destructive';
  export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

  export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    asChild?: boolean;
    variant?: ButtonVariant;
    size?: ButtonSize;
  }

  export const Button: React.ForwardRefExoticComponent<
    ButtonProps & React.RefAttributes<HTMLButtonElement>
  >;

  export function buttonVariants(args?: {
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string;
  }): string;
}
