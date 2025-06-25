// src/components/ui/Button.tsx
import React from 'react';
import { cn } from '@lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export default function Button({ children, className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cn(
        'w-full text-center font-bold uppercase tracking-wide rounded-lg px-6 py-4 text-white text-lg bg-black border-2 border-orange-500 hover:bg-orange-600 hover:border-orange-400 transition-all duration-300 shadow-md hover:shadow-lg',
        className
      )}
    >
      {children}
    </button>
  );
}