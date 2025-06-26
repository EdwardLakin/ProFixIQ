'use client';

import { useRouter } from 'next/navigation';
import HomeButton from '@components/ui/HomeButton';

export default function InspectionMenuPage() {
  const router = useRouter();

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <HomeButton />

      <h1 className="text-3xl mb-2 text-center font-blackops text-orange-500 drop-shadow">
        Inspection Menu
      </h1>
      <p className="text-lg text-center text-neutral-300 mb-8">
        Select an inspection type below to begin:
      </p>

      <div className="space-y-6 mt-8">
        <button
          onClick={() => router.push('/inspection/maintenance50')}
          className="w-full py-5 px-6 border-4 border-blue-400 text-blue-400 font-bold text-2xl rounded-xl bg-black bg-opacity-60 hover:bg-opacity-80 transition"
        >
          Maintenance 50 Point
        </button>

        <button
          onClick={() => router.push('/inspection/start?template=brake')}
          className="w-full py-5 px-6 border-4 border-red-400 text-red-400 font-bold text-2xl rounded-xl bg-black bg-opacity-60 hover:bg-opacity-80 transition"
        >
          Brake Inspection
        </button>

        <button
          onClick={() => router.push('/inspection/start?template=custom')}
          className="w-full py-5 px-6 border-4 border-orange-400 text-orange-400 font-bold text-2xl rounded-xl bg-black bg-opacity-60 hover:bg-opacity-80 transition"
        >
          Custom Inspection
        </button>
      </div>
    </div>
  );
}