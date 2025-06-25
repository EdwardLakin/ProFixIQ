'use client';

import React from 'react';
import { cn } from '@lib/utils';

export default function Footer({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'w-full text-center py-6 text-neutral-400 text-sm border-t border-neutral-800 bg-black/30 backdrop-blur-sm',
        className
      )}
    >
      <p className="font-mono">
        © {new Date().getFullYear()} ProFixIQ. Built for pros, powered by AI.
      </p>
    </footer>
  );
}