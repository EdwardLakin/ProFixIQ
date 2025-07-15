// src/lib/work-orders/insertPrioritizedJobs.ts
import supabase from '@lib/supabaseClient';
import type { Database } from '@/types/supabase';

type WorkOrderLineInsert = Database['public']['Tables']['work_order_lines']['Insert'];

export async function insertPrioritizedJobs(
  workOrderId: string,
  jobs: WorkOrderLineInsert[]
) {
  // 1. Define the job type priority order
  const priority = ['diagnosis', 'inspection-fail', 'maintenance', 'repair'];

  // 2. Sort jobs based on the job_type priority
  const sortedJobs = jobs.sort((a, b) => {
    const aPriority = priority.indexOf(a.job_type || 'repair');
    const bPriority = priority.indexOf(b.job_type || 'repair');
    return aPriority - bPriority;
  });

  // 3. Insert each job in sorted order
  const insertedJobs = [];
  for (const job of sortedJobs) {
    const { data, error } = await supabase
      .from('work_order_lines')
      .insert({
        ...job,
        work_order_id: workOrderId,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to insert job:', error);
      continue;
    }

    insertedJobs.push(data);
  }

  return insertedJobs;
}