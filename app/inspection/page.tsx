'use client';

import { useRouter } from 'next/navigation';
import HomeButton from '@components/ui/HomeButton';

export default function InspectionMenuPage() {
  const router = useRouter();

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 text-white">
      <div className="flex justify-end mb-6">
        <HomeButton />
      </div>

      <h1 className="text-7xl text-center font-blackops text-orange-500 drop-shadow mb-2">
        Inspection
      </h1>
      <p className="text-lg text-center text-neutral-300 mb-10">
        Choose an inspection type to begin:
      </p>

      <div className="space-y-6">
        <button
          onClick={() => router.push('/inspection/maintenance')}
          className="w-full py-5 px-6 border-4 border-blue-400 text-blue-400 font-blackops text-xl rounded-lg hover:scale-105 hover:bg-blue-900 transition-transform duration-200"
        >
          Maintenance 50 Point
          <p className="mt-2 text-sm font-normal text-white">
            General systems check for wear, damage, and fluid levels.
          </p>
        </button>

        <button
          className="w-full py-5 px-6 border-4 border-green-400 text-green-400 font-blackops text-xl rounded-lg hover:scale-105 hover:bg-green-900 transition-transform duration-200"
        >
          Pre-Purchase
          <p className="mt-2 text-sm font-normal text-white">
            Inspection before buying a used vehicle.
          </p>
        </button>

        <button
          className="w-full py-5 px-6 border-4 border-red-400 text-red-400 font-blackops text-xl rounded-lg hover:scale-105 hover:bg-red-900 transition-transform duration-200"
        >
          Safety
          <p className="mt-2 text-sm font-normal text-white">
            Safety-focused checklist for roadworthiness.
          </p>
        </button>

        <button
          className="w-full py-5 px-6 border-4 border-yellow-400 text-yellow-400 font-blackops text-xl rounded-lg hover:scale-105 hover:bg-yellow-900 transition-transform duration-200"
        >
          Used Vehicle
          <p className="mt-2 text-sm font-normal text-white">
            Deep dive into wear and past repairs.
          </p>
        </button>

        <button
          className="w-full py-5 px-6 border-4 border-purple-400 text-purple-400 font-blackops text-xl rounded-lg hover:scale-105 hover:bg-purple-900 transition-transform duration-200"
        >
          Seasonal
          <p className="mt-2 text-sm font-normal text-white">
            Get ready for winter, summer, or road trips.
          </p>
        </button>

        <button
          className="w-full py-5 px-6 border-4 border-orange-400 text-orange-400 font-blackops text-xl rounded-lg hover:scale-105 hover:bg-orange-900 transition-transform duration-200"
        >
          Custom
          <p className="mt-2 text-sm font-normal text-white">
            Build your own checklist tailored to your needs.
          </p>
        </button>
      </div>
    </div>
  );
}