'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

interface PreviousPageButtonProps {
  to: string;
  label?: string;
}

export default function PreviousPageButton({ to, label = 'Previous Page' }: PreviousPageButtonProps) {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push(to)}
      className="mb-4 inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-orange-500 font-blackops text-sm rounded hover:bg-orange-500 hover:text-black transition duration-150"
    >
      <ArrowLeft size={16} />
      {label}
    </button>
  );
}