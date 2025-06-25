'use client';

import { useRouter } from 'next/navigation';
import HomeButton from '@components/ui/HomeButton';
import PreviousButton from '@components/ui/PreviousPageButton';
import '@styles/globals.css';

const inspections = [
  { title: 'Maintenance 50 Point', href: '/inspection/maintenance50' },
  { title: 'Brake Inspection', href: '/inspection/start?template=brake' },
  { title: 'Suspension Check', href: '/inspection/start?template=suspension' },
  { title: 'Cooling System', href: '/inspection/start?template=cooling' },
  { title: 'Pre-Purchase', href: '/inspection/start?template=purchase' },
  { title: 'Custom Inspection', href: '/inspection/start?template=custom' },
];

export default function InspectionMenu() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black bg-opacity-90 text-white flex flex-col items-center p-6 pt-20">
      <h1 className="text-4xl font-black mb-10 text-center">Choose an Inspection</h1>
      <div className="grid grid-cols-2 gap-6 w-full max-w-3xl">
        {inspections.map((item) => (
          <button
            key={item.title}
            onClick={() => router.push(item.href)}
            className="bg-white bg-opacity-10 text-lg font-bold py-6 px-4 rounded-lg border border-orange-500 hover:bg-orange-600 hover:text-black transition"
          >
            {item.title}
          </button>
        ))}
      </div>

      <div className="absolute top-4 left-4">
        <HomeButton />
      </div>
      <div className="absolute top-4 right-4">
        <PreviousButton to="/app" />
      </div>
    </div>
  );
}