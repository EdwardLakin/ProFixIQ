'use client';

import { useRouter } from 'next/navigation';

interface PreviousPageButtonProps {
  to: string;
}

export default function PreviousPageButton({ to }: PreviousPageButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(to)}
      className="text-orange-400 hover:underline mb-4 block"
    >
      ← Back
    </button>
  );
}