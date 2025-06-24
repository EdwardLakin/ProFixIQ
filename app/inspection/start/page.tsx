// app/inspection/start/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { InspectionState } from '@lib/inspection/types';
import maintenance50Point from '@lib/inspection/templates/maintenance50Point';

export default function StartInspectionPage() {
  const router = useRouter();

  useEffect(() => {
    const initialState: InspectionState = {
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sections: {},
    };

    // Convert template into state structure
    for (const section of Object.keys(maintenance50Point)) {
      initialState.sections[section] = {};
      for (const item of maintenance50Point[section]) {
        initialState.sections[section][item] = { status: 'ok', notes: [] };
      }
    }

    localStorage.setItem('inspectionState', JSON.stringify(initialState));
  }, []);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <h1 className="text-3xl font-bold mb-6">Maintenance 50-Point Inspection</h1>
      <p className="text-lg text-center mb-8">
        This inspection checks all major systems for wear, damage, and fluid levels.
      </p>
      <button
        className="bg-green-600 text-white px-6 py-3 rounded-lg text-lg font-bold"
        onClick={() => router.push('/inspection')}
      >
        Start Inspection
      </button>
    </div>
  );
}