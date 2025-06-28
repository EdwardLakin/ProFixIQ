'use client';

import Link from 'next/link';
import HomeButton from '@components/ui/HomeButton';

export default function InspectionMenuPage() {
  return (
    <div className="min-h-screen bg-black bg-opacity-90 text-white px-4 pt-6">
      <HomeButton />

      <h1 className="text-4xl font-black text-center mt-6 mb-10">
        Choose an Inspection
      </h1>

      <div className="grid grid-cols-1 gap-6 max-w-2xl mx-auto">
        <Link href="/inspection/maintenance50">
          <button className="w-full py-6 text-xl font-bold border border-blue-400 text-blue-400 hover:bg-blue-500 hover:text-black transition-all duration-200 rounded-md">
            Maintenance 50 Point
          </button>
        </Link>

        <button className="w-full py-6 text-xl font-bold border border-gray-600 text-gray-400 rounded-md opacity-50 cursor-not-allowed">
          Coming Soon 1
        </button>
        <button className="w-full py-6 text-xl font-bold border border-gray-600 text-gray-400 rounded-md opacity-50 cursor-not-allowed">
          Coming Soon 2
        </button>
        <button className="w-full py-6 text-xl font-bold border border-gray-600 text-gray-400 rounded-md opacity-50 cursor-not-allowed">
          Coming Soon 3
        </button>
        <button className="w-full py-6 text-xl font-bold border border-gray-600 text-gray-400 rounded-md opacity-50 cursor-not-allowed">
          Coming Soon 4
        </button>
        <button className="w-full py-6 text-xl font-bold border border-gray-600 text-gray-400 rounded-md opacity-50 cursor-not-allowed">
          Coming Soon 5
        </button>
      </div>
    </div>
  );
}