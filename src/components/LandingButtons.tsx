'use client';

import { useRouter } from 'next/navigation';

const features = [
  { label: 'AI Diagnosis', route: '/ai' },
  { label: 'Scan a Part', route: '#' },
  { label: 'View Repair Logs', route: '#' },
  { label: 'Tools & Specs', route: '#' },
  { label: 'AI Suggestions', route: '#' },
  { label: 'Manual Library', route: '#' },
];

export default function LandingButtons() {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 px-4 mt-12">
      {features.map(({ label, route }) => (
        <button
          key={label}
          onClick={() => router.push(route)}
          className="bg-black/70 text-white border border-orange-500 rounded-xl shadow-xl hover:shadow-orange-500/40 p-6 transition duration-200 ease-in-out"
        >
          <h3 className="text-xl font-header text-white mb-2 text-center">{label}</h3>
          <p className="text-sm text-gray-300 text-center">
            {getDescription(label)}
          </p>
        </button>
      ))}
    </div>
  );
}

function getDescription(label: string) {
  switch (label) {
    case 'AI Diagnosis':
      return 'Chat, Visual, and DTC Code Support';
    case 'Scan a Part':
      return 'Image-based Parts Identification';
    case 'View Repair Logs':
      return 'Track Issues and Fixes by VIN or Customer';
    case 'Tools & Specs':
      return 'Torque, Fluids, Sizes, Tools';
    case 'AI Suggestions':
      return 'Smart Fixes and Repair Guidance';
    case 'Manual Library':
      return 'OEM + Aftermarket References';
    default:
      return '';
  }
}