'use client';

import { useRouter } from 'next/navigation';

const features = [
  { label: 'AI Diagnosis', route: '/ai' },
  { label: 'Work Orders', route: '/work-orders' },
  { label: 'Inspection', route: '/inspection' },
  { label: 'Tools & Specs', route: '/tools' },
  { label: 'AI Suggestions', route: '/chat' },
  { label: 'Manual Library', route: '/manuals' },
];

export default function LandingButtons() {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 px-6 sm:px-12 lg:px-24 mt-12">
      {features.map(({ label, route }) => (
        <button
          key={label}
          onClick={() => router.push(route)}
          className="rounded-2xl border border-orange-500 bg-black/30 backdrop-blur-md shadow-card hover:shadow-glow text-white px-6 py-8 transition-all duration-300 hover:scale-105"
        >
          <h3 className="text-2xl font-header text-white mb-3">{label}</h3>
          <p className="text-base text-neutral-300 leading-snug">{getDescription(label)}</p>
        </button>
      ))}
    </div>
  );
}

function getDescription(label: string) {
  switch (label) {
    case 'AI Diagnosis':
      return 'Chat, Visual, and DTC Code Support';
    case 'Work Orders':
      return 'Create, Track, and Manage Repair Jobs';
    case 'Inspections':
      return 'Start an Inspection';
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