// app/work-orders/insertPrioritizedJobs.ts

import { v4 as uuidv4 } from 'uuid';
import { type Database } from '@/types/supabase';

type WorkOrderLineInsert = Database['public']['Tables']['work_order_lines']['Insert'];

type JobInput = {
  complaint: string;
  job_type: 'diagnosis' | 'inspection-fail' | 'maintenance' | 'repair';
  cause?: string;
};

export async function insertPrioritizedJobs(
  workOrderId: string,
  vehicleId: string,
  jobs: JobInput[]
) {
  const supabase = (await import('@lib/supabaseClient')).default;

  const priority = {
    diagnosis: 1,
    'inspection-fail': 2,
    maintenance: 3,
    repair: 4,
  };

  const prioritized = [...jobs].sort((a, b) => {
    return priority[a.job_type] - priority[b.job_type];
  });

  const jobLines: WorkOrderLineInsert[] = prioritized.map((job) => ({
    id: uuidv4(),
    work_order_id: workOrderId,
    vehicle_id: vehicleId,
    complaint: job.complaint,
    cause: job.cause ?? null,
    job_type: job.job_type,
    status: 'awaiting',
    punched_in_at: null,
    punched_out_at: null,
    hold_reason: null,
    assigned_tech_id: null,
    assigned_to: null,
  }));

  const { error } = await supabase.from('work_order_lines').insert(jobLines);

  return { error };
}