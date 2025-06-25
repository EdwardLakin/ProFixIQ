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
        'rounded-xl p-5 backdrop-blur-md border text-white flex flex-col gap-2 items-start text-left font-blackopsone',
        available
          ? 'border-green-600'
          : 'border-red-500 opacity-80',
        className
      )}
    >
      <div className="flex items-center gap-2 text-lg">
        {available ? (
          <CheckCircle2 className="text-green-500 w-5 h-5" />
        ) : (
          <Lock className="text-red-400 w-5 h-5" />
        )}
        <span>{title}</span>
      </div>
      <p className="text-sm text-neutral-300 font-sans">{description}</p>
    </div>
  );
}