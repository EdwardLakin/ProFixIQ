'use client';

import { useRouter } from 'next/navigation';
import { FaCamera, FaCode, FaRobot } from 'react-icons/fa';
import HomeButton from '@components/ui/HomeButton';

export default function AIDiagnosisPage() {
  const router = useRouter();

  const cards = [
    {
      icon: <FaCamera className="text-4xl text-blue-400 mb-2" />,
      title: 'Analyze Image',
      description: 'Upload or capture a photo to identify visible issues using GPT-4o Vision.',
      route: '/ai/photo',
      color: 'blue-400',
    },
    {
      icon: <FaCode className="text-4xl text-yellow-400 mb-2" />,
      title: 'DTC Code Lookup',
      description: 'Enter a trouble code (e.g., P0171) to get an explanation and fix.',
      route: '/ai/dtc',
      color: 'yellow-400',
    },
    {
      icon: <FaRobot className="text-4xl text-green-400 mb-2" />,
      title: 'TechBot Assistant',
      description: 'Ask the AI mechanic about symptoms, repairs, or next steps using freeform chat.',
      route: '/ai/chat',
      color: 'green-400',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 text-white">
      <HomeButton />

      <h1 className="text-6xl mb-2 text-center font-blackops text-orange-500 drop-shadow">
        AI Diagnosis
      </h1>
      <p className="text-lg text-center text-neutral-300 mb-10">
        Select a diagnostic method below to begin:
      </p>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ icon, title, description, route, color }) => (
          <button
            key={title}
            onClick={() => router.push(route)}
            className={`w-full py-6 px-5 border-4 border-${color} text-${color} font-bold text-left rounded-xl bg-black bg-opacity-40 shadow-md hover:scale-[1.02] hover:shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-${color}`}
          >
            <div className="flex flex-col items-start space-y-2">
              {icon}
              <p className="text-2xl">{title}</p>
              <p className="text-sm font-normal text-white">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}