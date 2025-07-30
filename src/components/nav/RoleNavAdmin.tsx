'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import ShiftTracker from '@components/punch/ShiftTracker';

export default function RoleNavAdmin() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      setUserId(uid);

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', uid)
        .single();

      setRole(profile?.role ?? null);
    };

    fetchRole();
  }, [supabase]);

  if (!role || !['admin', 'manager', 'owner'].includes(role)) return null;

  const linkClass = (href: string) =>
    clsx(
      'block px-4 py-2 rounded hover:bg-orange-600',
      pathname === href && 'bg-orange-700 text-black'
    );

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6">
      <div>
        <p className="uppercase text-sm text-orange-400 mb-2">Admin Panel</p>
        <div className="space-y-1">
          <Link href="/dashboard/admin" className={linkClass('/dashboard/admin')}>
            Admin Dashboard
          </Link>
          <Link href="/work-orders/create" className={linkClass('/work-orders/create')}>
            Create Work Order
          </Link>
          <Link href="/work-orders/queue" className={linkClass('/work-orders/queue')}>
            Job Queue
          </Link>
          <Link href="/work-orders" className={linkClass('/work-orders')}>
            All Work Orders
          </Link>
          <Link href="/menu" className={linkClass('/menu')}>
            Menu Items
          </Link>
          <Link href="/admin/create-tech" className={linkClass('/admin/create-tech')}>
            Create Tech
          </Link>
        </div>
      </div>

      {/* ✅ Add punch system here */}
      {userId && (
        <div className="mt-6 border-t border-gray-800 pt-4">
          <p className="uppercase text-sm text-orange-400 mb-2">Shift Tracker</p>
          <ShiftTracker userId={userId} />
        </div>
      )}
    </nav>
  );
}