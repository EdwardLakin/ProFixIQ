'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function Container({ children, className }: ContainerProps) {
  return (
    <div
      className={cn(
        'w-full max-w-7xl px-4 md:px-6 lg:px-8 mx-auto',
        className
      )}
    >
      {children}
    </div>
  );
}