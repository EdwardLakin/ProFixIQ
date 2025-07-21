// components/sidebar/RoleNavParts.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

export default function RoleNavParts() {
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

  if (role !== 'parts') return null;

  return (
    <nav className="w-full md:w-64 bg-neutral-900 p-4 text-white space-y-6">
      <div>
        <h2 className="text-orange-500 font-bold mb-2">Parts</h2>
        <div className="space-y-1">
          <Link href="/dashboard/parts" className="block hover:text-orange-400">Parts Dashboard</Link>
          <Link href="/parts/inventory" className="block hover:text-orange-400">Inventory</Link>
          <Link href="/parts/returns" className="block hover:text-orange-400">Returns</Link>
          <Link href="/parts/warranties" className="block hover:text-orange-400">Warranties</Link>
        </div>
      </div>
    </nav>
  );
}