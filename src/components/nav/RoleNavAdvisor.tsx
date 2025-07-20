'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import clsx from 'clsx';
import type { Database } from '@/types/supabase';

export default function RoleNavAdvisor() {
  const supabase = createClientComponentClient<Database>();
  const pathname = usePathname();
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

  if (role !== 'advisor') return null;

  const linkClass = (href: string) =>
    clsx(
      'block px-4 py-2 rounded hover:bg-orange-600',
      pathname === href && 'bg-orange-700 text-black'
    );

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6">
      <div>
        <h2 className="text-orange-500 font-bold mb-2">Work Orders</h2>
        <div className="space-y-1">
          <Link href="/work-orders/create" className={linkClass('/work-orders/create')}>Create Work Order</Link>
          <Link href="/work-orders/queue" className={linkClass('/work-orders/queue')}>Job Queue</Link>
          <Link href="/work-orders" className={linkClass('/work-orders')}>All Work Orders</Link>
        </div>
      </div>

      <div>
        <h2 className="text-orange-500 font-bold mb-2">Advising</h2>
        <div className="space-y-1">
          <Link href="/inspections" className={linkClass('/inspections')}>Inspections</Link>
          <Link href="/dashboard/advisor" className={linkClass('/dashboard/advisor')}>Advisor Dashboard</Link>
        </div>
      </div>

      <div>
        <h2 className="text-orange-500 font-bold mb-2">Settings</h2>
        <div className="space-y-1">
          <Link href="/compare-plans" className={linkClass('/compare-plans')}>Plan & Billing</Link>
        </div>
      </div>
    </nav>
  );
}