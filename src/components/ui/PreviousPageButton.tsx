// components/ui/PreviousPageButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@heroicons/react/24/solid';

interface PreviousPageButtonProps {
  to: string;
}

export default function PreviousPageButton({ to }: PreviousPageButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    router.push(to);
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center text-sm text-orange-400 hover:text-orange-300 transition duration-200"
    >
      <ArrowLeftIcon className="h-5 w-5 mr-1" />
      Back
    </button>
  );
}