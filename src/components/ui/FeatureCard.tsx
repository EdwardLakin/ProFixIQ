'use client';

import { CheckCircle2, Lock } from 'lucide-react';
import { cn } from '@lib/utils';

interface FeatureCardProps {
  title: string;
  description: string;
  available: boolean;
  className?: string;
}

export default function FeatureCard({
  title,
  description,
  available,
  className,
}: FeatureCardProps) {
  return (
    <div
      className={cn(
        'rounded-xl p-5 backdrop-blur-md border transition-all duration-300 shadow-md',
        'flex flex-col gap-2 items-start text-left',
        'font-blackopsone text-white',
        available
          ? 'border-green-600 bg-green-900/10 hover:shadow-green-600/40'
          : 'border-red-500 bg-red-900/10 opacity-80 hover:shadow-red-600/40',
        className
      )}
    >
      <div className="flex items-center gap-2 text-lg">
        {available ? (
          <CheckCircle2 className="text-green-400 w-5 h-5" />
        ) : (
          <Lock className="text-red-400 w-5 h-5" />
        )}
        <span>{title}</span>
      </div>
      <p className="text-sm text-neutral-300 font-sans leading-snug">{description}</p>
    </div>
  );
}