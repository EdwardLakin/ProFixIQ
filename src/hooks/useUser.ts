import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function useUser() {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      setIsLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const userId = session?.user?.id;

      if (!userId) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*, shop(*)')
        .eq('id', userId)
        .single();

      setUser(data);
      setIsLoading(false);
    };

    fetchUser();
  }, []);

  return { user, isLoading };
}