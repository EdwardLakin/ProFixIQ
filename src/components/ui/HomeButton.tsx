'use client';

import { useRouter } from 'next/navigation';

export default function HomeButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.push('/')}
      className="fixed top-4 left-4 bg-orange-500 hover:bg-orange-600 text-black font-blackops px-4 py-2 rounded-lg shadow-lg z-50"
    >
      Home
    </button>
  );
}