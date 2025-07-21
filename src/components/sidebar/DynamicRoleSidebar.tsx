'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';

import RoleNavAdmin from '@components/nav/RoleNavAdmin';
import RoleNavTech from '@components/nav/RoleNavTech';
import RoleNavAdvisor from '@components/nav/RoleNavAdvisor';
import RoleNavOwner from '@components/nav/RoleNavOwner';
import RoleNavParts from '@components/nav/RoleNavParts';

export default function DynamicRoleSidebar() {
  const supabase = createClientComponentClient<Database>();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchRole = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profile?.role) setRole(profile.role);
    };

    fetchRole();
  }, [supabase]);

  if (!role) return null;

  switch (role) {
    case 'admin':
    case 'manager':
      return <RoleNavAdmin />;
    case 'mechanic':
      return <RoleNavTech />;
    case 'advisor':
      return <RoleNavAdvisor />;
    case 'owner':
      return <RoleNavOwner />;
    case 'parts':
      return <RoleNavParts />;
    default:
      return null;
  }
}