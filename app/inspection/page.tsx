'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import HomeButton from '@components/ui/HomeButton';

export default function InspectionMenu() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Store customer and vehicle info from query in localStorage
  useEffect(() => {
    const query = Object.fromEntries(searchParams.entries());

    const customer = {
      first_name: query.first_name || '',
      last_name: query.last_name || '',
      phone: query.phone || '',
      email: query.email || '',
    };

    const vehicle = {
      year: query.year || '',
      make: query.make || '',
      model: query.model || '',
      vin: query.vin || '',
      license_plate: query.license_plate || '',
      mileage: query.mileage || '',
      color: query.color || '',
    };

    localStorage.setItem('inspectionCustomer', JSON.stringify(customer));
    localStorage.setItem('inspectionVehicle', JSON.stringify(vehicle));
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-black text-white relative px-4 pb-8 pt-20 max-w-3xl mx-auto">
      <HomeButton />

      <h1 className="text-3xl font-black text-center text-orange-500 mb-8 font-blackOps">
        Choose an Inspection
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          className="bg-zinc-900 border border-orange-500 rounded-lg p-4 shadow hover:scale-105 transition-all"
          onClick={() => router.push('/inspection/customer-vehicle?inspectionType=maintenance50')}
        >
          <h2 className="text-xl font-bold text-orange-400 mb-2">Maintenance 50 Point</h2>
          <p className="text-sm text-zinc-300">Comprehensive vehicle health check</p>
        </button>

        <button
          className="bg-zinc-900 border border-orange-500 rounded-lg p-4 shadow hover:scale-105 transition-all"
          onClick={() => router.push('/inspection/brake')}
        >
          <h2 className="text-xl font-bold text-orange-400 mb-2">Brake Inspection</h2>
          <p className="text-sm text-zinc-300">Pads, rotors, calipers, lines, and more</p>
        </button>

        <button
          className="bg-zinc-900 border border-orange-500 rounded-lg p-4 shadow hover:scale-105 transition-all"
          onClick={() => router.push('/inspection/diagnostic')}
        >
          <h2 className="text-xl font-bold text-orange-400 mb-2">Diagnostic</h2>
          <p className="text-sm text-zinc-300">Issue investigation & fault tracing</p>
        </button>

        <button
          className="bg-zinc-900 border border-orange-500 rounded-lg p-4 shadow hover:scale-105 transition-all"
          onClick={() => router.push('/inspection/cvip')}
        >
          <h2 className="text-xl font-bold text-orange-400 mb-2">CVIP</h2>
          <p className="text-sm text-zinc-300">Commercial Vehicle Inspection Program</p>
        </button>

        <button
          className="bg-zinc-900 border border-orange-500 rounded-lg p-4 shadow hover:scale-105 transition-all"
          onClick={() => router.push('/inspection/custom')}
        >
          <h2 className="text-xl font-bold text-orange-400 mb-2">Custom Inspection</h2>
          <p className="text-sm text-zinc-300">Build your own inspection checklist</p>
        </button>

        <button
          className="bg-zinc-900 border border-orange-500 rounded-lg p-4 shadow hover:scale-105 transition-all"
          onClick={() => router.push('/inspection/saved')}
        >
          <h2 className="text-xl font-bold text-orange-400 mb-2">Saved Inspections</h2>
          <p className="text-sm text-zinc-300">View, edit, and continue past inspections</p>
        </button>
      </div>
    </div>
  );
}