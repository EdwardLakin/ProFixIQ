'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface HeadingProps {
  title: string;
  subtitle?: string;
  center?: boolean;
  size?: 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';
}

const sizeClasses = {
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
  '6xl': 'text-6xl',
};

export default function Heading({
  title,
  subtitle,
  center = true,
  size = '6xl',
}: HeadingProps) {
  return (
    <div className={cn('mb-10', center && 'text-center')}>
      <h1
        className={cn(
          sizeClasses[size],
          'font-blackops text-accent drop-shadow-sm tracking-wide leading-tight'
        )}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className={cn(
            'text-sm md:text-base mt-2 text-muted',
            center && 'mx-auto max-w-xl'
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}