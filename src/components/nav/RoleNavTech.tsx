'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import clsx from 'clsx';

export default function RoleNavTech() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<string | null>(null);
  const pathname = usePathname();

  const linkClass = (href: string) =>
    clsx(
      'block px-4 py-2 rounded hover:bg-orange-600',
      pathname === href && 'bg-orange-700 text-black'
    );

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

  if (role !== 'mechanic') return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="uppercase text-sm text-orange-400 mb-2">Jobs</p>
        <Link href="/work-orders/queue" className={linkClass('/work-orders/queue')}>
          Queued Jobs
        </Link>
        <Link href="/work-orders" className={linkClass('/work-orders')}>
          All Work Orders
        </Link>
      </div>

      <div>
        <p className="uppercase text-sm text-orange-400 mb-2">Inspections</p>
        <Link href="/inspections" className={linkClass('/inspections')}>
          My Inspections
        </Link>
      </div>

      <div>
        <p className="uppercase text-sm text-orange-400 mb-2">Dashboard</p>
        <Link href="/dashboard/tech" className={linkClass('/dashboard/tech')}>
          Tech Dashboard
        </Link>
      </div>
    </div>
  );
}