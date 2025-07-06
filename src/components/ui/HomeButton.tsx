'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';

interface HomeButtonProps {
  className?: string;
}

export default function HomeButton({ className }: HomeButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/')}
      className={`text-orange-400 hover:text-orange-200 transition flex items-center gap-1 ${className}`}
    >
      <ArrowLeftIcon className="w-5 h-5" />
      Home
    </button>
  );
}