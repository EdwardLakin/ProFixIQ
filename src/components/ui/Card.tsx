'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-orange-500 bg-black/50 text-white shadow-xl p-6 hover:shadow-orange-400/20 transition-shadow duration-200',
        className
      )}
    >
      {children}
    </div>
  );
}