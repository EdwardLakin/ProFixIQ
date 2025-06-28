'use client';

import { useRouter } from 'next/navigation';

export default function PreviousPageButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="text-orange-400 hover:text-white font-black uppercase tracking-wide mb-4"
    >
      ← Previous Page
    </button>
  );
}