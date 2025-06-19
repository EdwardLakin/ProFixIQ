'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface HeadingProps {
  title?: string;
  subtitle?: string;
  center?: boolean;
}

export default function Heading({
  title = 'Welcome to',
  subtitle = 'The AI-powered diagnostic platform built for pros and DIYers.',
  center = true,
}: HeadingProps) {
  return (
    <div className={cn('mb-16', center && 'text-center')}>
      {/* Optional glass panel wrapper */}
      <div className="inline-block px-8 py-6 rounded-xl backdrop-blur-md bg-white/5 border border-orange-500/20 shadow-xl">
        {/* Top line */}
        <h1 className="text-6xl sm:text-7xl text-orange-500 font-blackops drop-shadow-md">
          {title}
        </h1>

        {/* ProFixIQ line */}
        <h2 className="text-8xl sm:text-9xl font-header tracking-tight mt-2">
          <span className="bg-gradient-to-br from-orange-500 via-orange-400 to-yellow-300 text-transparent bg-clip-text drop-shadow-[0_0_10px_rgba(255,100,0,0.6)]">
            ProFix
          </span>
          <span className="text-yellow-400 drop-shadow-[0_0_6px_rgba(255,200,0,0.6)] ml-1">
            IQ
          </span>
        </h2>

        {/* Subtitle */}
        {subtitle && (
          <p className="mt-4 text-lg text-neutral-300">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}