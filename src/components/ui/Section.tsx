'use client';

import React from 'react';
import { cn } from '@lib/utils';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

export default function Section({
  children,
  className,
  id,
  ariaLabel,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-label={ariaLabel || id || undefined}
      className={cn(
        'w-full py-10 md:py-14 lg:py-20 px-4 sm:px-6 fade-in',
        className
      )}
    >
      {children}
    </section>
  );
}