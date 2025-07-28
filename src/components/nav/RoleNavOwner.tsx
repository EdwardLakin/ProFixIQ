'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function RoleNavOwner() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      setRole(profile?.role ?? null);
    };

    fetchRole();
  }, [supabase]);

  if (role !== 'owner') return null;

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6">
      <div>
        <h2 className="text-orange-500 font-bold mb-2">Work Orders</h2>
        <div className="space-y-1">
          <Link href="/work-orders/create" className="block hover:text-orange-400">Create Work Order</Link>
          <Link href="/work-orders/queue" className="block hover:text-orange-400">Job Queue</Link>
          <Link href="/work-orders" className="block hover:text-orange-400">All Work Orders</Link>
        </div>
      </div>

      <div>
        <h2 className="text-orange-500 font-bold mb-2">Management</h2>
        <div className="space-y-1">
          <Link href="/menu" className="block hover:text-orange-400">Menu Items</Link>
          <Link href="/owner/create-user" className="block hover:text-orange-400">Create Technician</Link>
          <Link href="/dashboard/owner" className="block hover:text-orange-400">Owner Dashboard</Link>
        </div>
      </div>

      <div>
        <h2 className="text-orange-500 font-bold mb-2">Management</h2>
        <div className="space-y-1">
          <Link href="/inspection" className="block hover:text-orange-400">Menu Items</Link>
          <Link href="/maintenance50" className="block hover:text-orange-400">Menu Items</Link>
          
        </div>
      </div>

      <div>
        <h2 className="text-orange-500 font-bold mb-2">Settings</h2>
        <div className="space-y-1">
          <Link href="/settings" className="block hover:text-orange-400">Shop Settings</Link>
          <Link href="/compare-plans" className="block hover:text-orange-400">Plan & Billing</Link>
        </div>
      </div>
    </nav>
  );
}