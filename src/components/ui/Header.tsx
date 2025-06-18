'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface HeadingProps {
  title: string;
  subtitle?: string;
  center?: boolean;
  size?: '2xl' | '3xl' | '4xl';
}

export default function Heading({
  title,
  subtitle,
  center = true,
  size = '4xl',
}: HeadingProps) {
  return (
    <div className={cn('mb-10', center && 'text-center')}>
      <h1
        className={cn(
          `font-blackops text-${size}`,
          'text-orange-500 drop-shadow-sm tracking-wide leading-tight'
        )}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className={cn(
            'text-sm md:text-base mt-2 text-neutral-300',
            center && 'mx-auto max-w-xl'
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}