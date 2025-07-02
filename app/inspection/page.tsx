// app/inspection/page.tsx

'use client';

import { useRouter } from 'next/navigation';
import HomeButton from '@components/ui/HomeButton';
import Link from 'next/link';

const inspections = [
  {
    name: 'Maintenance 50 Point',
    path: '/inspection/maintenance50',
    templateId: 'maintenance50',
  },
  { name: 'Coming Soon 1', path: '#' },
  { name: 'Coming Soon 2', path: '#' },
  { name: 'Coming Soon 3', path: '#' },
  { name: 'Coming Soon 4', path: '#' },
  { name: 'Coming Soon 5', path: '#' },
];

export default function InspectionMenuPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8 flex flex-col items-center justify-start">
      <HomeButton />

      <h1 className="text-4xl font-black text-orange-500 mt-4 mb-8 text-center">
        Choose an Inspection
      </h1>

      <div className="flex flex-col gap-6 w-full max-w-md">
        {inspections.map((inspection, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Link
              href={inspection.path}
              className="text-center text-lg font-bold px-6 py-4 rounded-md bg-orange-500 hover:bg-orange-600 transition"
            >
              {inspection.name}
            </Link>

            {inspection.templateId && (
              <Link
                href={`/work-orders/create?pageFrom=inspection&template=${inspection.templateId}`}
                className="text-sm text-center px-4 py-2 rounded bg-slate-600 hover:bg-slate-700 transition"
              >
                Add to Work Order
              </Link>
            )}
          </div>
        ))}

        <Link
          href="/inspection/saved"
          className="mt-4 text-center text-white underline text-sm hover:text-orange-400"
        >
          View Saved Inspections
        </Link>
      </div>
    </div>
  );
}