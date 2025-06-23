// src/hooks/useUser.ts
'use client';

import { useEffect, useState } from 'react';
import supabase from '@/lib/supabaseClient';

export default function useUser() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error('Error getting user:', userError);
        setUser(null);
        setIsLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        if (profileError.code === 'PGRST116') {
          // Not found, create new profile
          const { error: insertError } = await supabase.from('profiles').insert({
            id: user.id,
            email: user.email,
            name: user.user_metadata?.name ?? '',
            plan: 'diy',
            shop_name: '',
            labor_rate: 0,
            parts_markup: 0,
            created_at: new Date().toISOString(),
            shop_id: null,
            is_active: true,
          });

          if (insertError) {
            console.error('Failed to create profile:', insertError);
            setUser(null);
            setIsLoading(false);
            return;
          }

          setUser({ id: user.id, email: user.email, plan: 'diy' });
        } else {
          console.error('Failed to fetch user profile:', profileError);
          setUser(null);
        }
      } else {
        setUser(profile);
      }

      setIsLoading(false);
    };

    fetchUser();
  }, []);

  return { user, isLoading };
}