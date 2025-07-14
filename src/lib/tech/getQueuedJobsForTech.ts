import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { type Database } from '../../types/supabase';

export async function getQueuedJobsForTech() {
  const supabase = createServerComponentClient<Database>({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user?.id) return [];

  const { data, error } = await supabase
    .from('work_order_lines')
    .select('*')
    .eq('assigned_to', session.user.id)
    .eq('status', 'queued');

  if (error) {
    console.error('Error fetching queued jobs:', error);
    return [];
  }

  return data;
}