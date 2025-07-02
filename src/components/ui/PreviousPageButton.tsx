'use client';

import { useRouter } from 'next/navigation';

const PreviousPageButton = () => {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="text-white bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-md shadow-md transition-colors"
    >
      ⬅ Previous Page
    </button>
  );
};

export default PreviousPageButton;