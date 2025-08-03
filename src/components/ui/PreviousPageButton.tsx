'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';

interface PreviousPageButtonProps {
  to: string;
  label?: string; // optional override for "Back" text
}

export default function PreviousPageButton({ to, label = 'Back' }: PreviousPageButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push(to)}
      aria-label="Go to previous page"
      className="flex items-center text-sm text-orange-400 hover:text-orange-300 transition duration-200 focus:outline-none focus:ring-2 focus:ring-orange-400 rounded"
    >
      <ArrowLeftIcon className="h-5 w-5 mr-1" />
      {label}
    </button>
  );
}