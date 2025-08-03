import * as React from 'react';
import { cn } from '@lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          'w-full h-10 rounded-md px-3 py-2 text-sm text-white',
          'bg-zinc-900 border border-zinc-700',
          'placeholder:text-neutral-400',
          'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500',
          'transition-all duration-200 ease-in-out',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export { Input };