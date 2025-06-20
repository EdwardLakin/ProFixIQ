'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface HeadingProps {
  title?: string;
  highlight?: string;
  subtitle?: string;
  center?: boolean;
}

export default function Heading({
  title = 'Welcome to',
  highlight = 'ProFixIQ',
  subtitle = 'The AI-powered diagnostic platform built for pros and DIYers.',
  center = true,
}: HeadingProps) {
  return (
    <div className={cn('mb-16', center && 'text-center')}>
      {/* Optional glass panel wrapper */}
      <div className="inline-block px-8 py-6 rounded-xl backdrop-blur-md bg-white/5 border border-orange-400 shadow-xl">
        <h2 className="text-6xl sm:text-7xl text-orange-500 font-black drop-shadow-[0_0_6px_rgba(255,200,0,0.6)]">
          {title}{' '}
          <span className="text-yellow-400 drop-shadow-[0_0_6px_rgba(255,200,0,0.6)]">
            {highlight}
          </span>
        </h2>
        {subtitle && (
          <p className="mt-4 text-lg text-neutral-300">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}