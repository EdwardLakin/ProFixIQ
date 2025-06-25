'use client';

import React from 'react';
import { cn } from '@lib/utils';

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
      {/* Glass card wrapper */}
      <div className="inline-block px-8 py-6 rounded-xl backdrop-blur-md bg-white/5 border border-orange-500 shadow-xl">
        {/* Title */}
        <h1 className="text-4xl sm:text-5xl text-orange-500 font-blackops drop-shadow-md">
          {title}
        </h1>

        <h2 className="text-9xl sm:text-[10rem] font-blackops tracking-tight mt-2">
          <span className="bg-gradient-to-br from-orange-500 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
            Pro
          </span>
          <span className="text-yellow-400 drop-shadow-[0_0_6px_rgba(255,200,0,0.6)]">
            FixIQ
          </span>
        </h2>

        {/* Subtitle */}
        {subtitle && (
          <p className="mt-4 text-lg text-neutral-300 max-w-3xl mx-auto">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}