'use client';

import { useRouter } from 'next/navigation';
import HomeButton from '@components/ui/HomeButton';

export default function InspectionMenuPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-white px-4 py-10 relative">
      <HomeButton />
      <h1 className="text-4xl text-center text-orange-500 font-blackops drop-shadow mb-6">
        Choose an Inspection
      </h1>
      <div className="space-y-6 max-w-xl mx-auto">
        <button
          onClick={() => router.push('/inspection/maintenance50')}
          className="w-full py-5 px-6 border-4 border-orange-500 text-orange-500 text-2xl font-bold uppercase rounded-xl hover:bg-orange-500 hover:text-black transition"
        >
          Maintenance 50-Point
        </button>

        <button
          onClick={() => router.push('/inspection/cvip')}
          className="w-full py-5 px-6 border-4 border-blue-500 text-blue-500 text-2xl font-bold uppercase rounded-xl hover:bg-blue-500 hover:text-black transition"
        >
          CVIP Inspection
        </button>

        <button
          onClick={() => router.push('/inspection/brake')}
          className="w-full py-5 px-6 border-4 border-red-500 text-red-500 text-2xl font-bold uppercase rounded-xl hover:bg-red-500 hover:text-black transition"
        >
          Brake Inspection
        </button>

        <button
          onClick={() => router.push('/inspection/custom')}
          className="w-full py-5 px-6 border-4 border-green-500 text-green-500 text-2xl font-bold uppercase rounded-xl hover:bg-green-500 hover:text-black transition"
        >
          Custom Inspection
        </button>

        <button
          onClick={() => router.push('/inspection/saved')}
          className="w-full py-5 px-6 border-4 border-yellow-400 text-yellow-400 text-2xl font-bold uppercase rounded-xl hover:bg-yellow-400 hover:text-black transition"
        >
          Saved Inspections
        </button>

        <button
          onClick={() => router.push('/inspection/summary')}
          className="w-full py-5 px-6 border-4 border-purple-500 text-purple-500 text-2xl font-bold uppercase rounded-xl hover:bg-purple-500 hover:text-black transition"
        >
          Review Summary
        </button>
      </div>
    </div>
  );
}