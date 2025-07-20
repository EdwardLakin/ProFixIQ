'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function OwnerDashboardPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      const email = data.session?.user.email;
      if (email) setUserEmail(email);
    };

    getSession();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8 font-blackops">
      <h1 className="text-3xl text-orange-500 mb-4 text-center">Owner Dashboard</h1>
      <p className="text-center text-sm text-gray-300 mb-8">Logged in as {userEmail}</p>

      <div className="max-w-4xl mx-auto space-y-4">
        <div className="bg-gray-900 p-6 rounded shadow">
          <h2 className="text-xl font-bold text-orange-400 mb-2">Welcome, Owner</h2>
          <p className="text-sm text-gray-300">
            This dashboard will include full access to all tools, users, shops, reports, and settings.
          </p>
        </div>

        {/* Add more sections here as needed */}
        <div className="bg-gray-800 p-4 rounded">
          <h3 className="text-lg font-semibold text-white">Coming Soon</h3>
          <ul className="list-disc list-inside text-gray-400 text-sm mt-2">
            <li>Technician shift logs</li>
            <li>Shop-wide analytics</li>
            <li>Team management tools</li>
          </ul>
        </div>
      </div>
    </div>
  );
}