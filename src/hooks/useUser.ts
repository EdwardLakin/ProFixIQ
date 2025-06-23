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
      } = await supabase.auth.getUser();

      if (!user) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*, shop(*)')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('❌ Failed to fetch user profile:', error);
        setUser(null);
      } else {
        setUser(data);
      }

      setIsLoading(false);
    };

    fetchUser();
  }, []);

  return { user, isLoading };
}