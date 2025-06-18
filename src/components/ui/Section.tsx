'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
}

export default function Section({ children, className }: SectionProps) {
  return (
    <section
      className={cn(
        'w-full py-10 md:py-14 lg:py-20',
        className
      )}
    >
      {children}
    </section>
  );
}