import React from 'react';
import { cn } from '@lib/utils';

interface CardProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export default function Card({ children, onClick, className }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        `cursor-pointer
         rounded-2xl
         border border-orange-500
         bg-zinc-900/80
         backdrop-blur-md
         px-6 py-5
         transition-transform duration-300
         shadow-md
         hover:shadow-orange-500/30
         hover:scale-[1.02]
         hover:border-orange-400`,
        className
      )}
    >
      {children}
    </div>
  );
}