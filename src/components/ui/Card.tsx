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
         rounded-xl 
         border border-orange-500 
         bg-black/30 
         backdrop-blur-md 
         px-6 py-5 
         transition-all duration-300 
         shadow-card 
         hover:shadow-glow 
         hover:scale-[1.02]`,
        className
      )}
    >
      {children}
    </div>
  );
}