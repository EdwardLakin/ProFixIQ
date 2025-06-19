'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const features = [
  { icon: '🧰', label: 'Start Diagnosis', route: '/diagnose' },
  { icon: '📸', label: 'Scan a Part', route: '/scan' },
  { icon: '📄', label: 'View Repair Logs', route: '/logs' },
  { icon: '⚙️', label: 'Tools & Specs', route: '/tools' },
  { icon: '💡', label: 'AI Suggestions', route: '/ai-help' },
  { icon: '📚', label: 'Manual Library', route: '/manuals' },
];

export default function LandingButtons() {
  const router = useRouter();

  return (
    <div className="mt-16 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 place-items-center">
      {features.map(({ icon, label, route }) => (
        <button
          key={label}
          onClick={() => router.push(route)}
          className={cn(
            'w-full sm:w-72 p-6 rounded-xl border border-white/10',
            'bg-white/5 backdrop-blur-md text-white shadow-md',
            'hover:shadow-lg hover:scale-105 transition-all duration-300'
          )}
        >
          <div className="flex flex-col items-center space-y-3">
            <span className="text-4xl">{icon}</span>
            <span className="text-xl font-semibold">{label}</span>
          </div>
        </button>
      ))}
    </div>
  );
}