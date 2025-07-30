'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import ShiftTracker from '@components/punch/ShiftTracker';

export default function RoleNavTech() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      setRole(profile?.role ?? null);
    };

    fetchRole();
  }, [supabase]);

  if (role !== 'tech') return null;

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6">
      <div>
        <h2 className="text-orange-500 font-bold mb-2">Technician</h2>
        <div className="space-y-1">
          <Link href="/dashboard/tech" className="block hover:text-orange-400">Tech Dashboard</Link>
          <Link href="/work-orders/queue" className="block hover:text-orange-400">My Job Queue</Link>
          <Link href="/inspections" className="block hover:text-orange-400">My Inspections</Link>
        </div>
      </div>

      {userId && (
        <div className="mt-6 border-t border-gray-800 pt-4">
          <h2 className="text-orange-500 font-bold mb-2">Shift Tracker</h2>
          <ShiftTracker userId={userId} />
        </div>
      )}
    </nav>
  );
}