import supabase from '@lib/supabaseClient';
import { Database } from '@/types/supabase';

type Inspection = Database['public']['Tables']['inspections']['Row'];
type WorkOrderLineInsert = Database['public']['Tables']['work_order_lines']['Insert'];

export async function insertPrioritizedJobsFromInspection(
  inspectionId: string,
  workOrderId: string,
  vehicleId: string
) {
  const { data: inspection, error } = await supabase
    .from('inspections')
    .select('*')
    .eq('id', inspectionId)
    .single();

  if (error || !inspection) {
    console.error('Failed to fetch inspection:', error);
    return;
  }

  const result = inspection.result as any;
  if (!result?.sections) {
    console.warn('Invalid inspection format');
    return;
  }

  const diagnosisJobs: WorkOrderLineInsert[] = [];
  const inspectionFailJobs: WorkOrderLineInsert[] = [];
  const maintenanceJobs: WorkOrderLineInsert[] = [];
  const recommendedJobs: WorkOrderLineInsert[] = [];

  const diagnosisKeywords = ['check engine', 'diagnose', 'misfire', 'no start'];
  const maintenanceKeywords = ['oil', 'fluid', 'filter', 'belt', 'coolant'];

  result.sections.forEach((section: any) => {
    section.items.forEach((item: any) => {
      const name = item.name?.toLowerCase() || '';
      const baseJob: WorkOrderLineInsert = {
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: item.name,
        status: 'queued',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        punched_in_at: null,
        punched_out_at: null,
        hold_reason: null,
        assigned_to: null,
        assigned_tech_id: null,
        job_type: 'repair', // default if not overridden
      };

      if (diagnosisKeywords.some(k => name.includes(k))) {
        diagnosisJobs.push({ ...baseJob, job_type: 'diagnosis' });
      } else if (item.status === 'fail') {
        inspectionFailJobs.push({ ...baseJob, job_type: 'inspection-fail' });
      } else if (item.recommend === true) {
        recommendedJobs.push({ ...baseJob, job_type: 'repair' });
      } else if (maintenanceKeywords.some(k => name.includes(k))) {
        maintenanceJobs.push({ ...baseJob, job_type: 'maintenance' });
      }
    });
  });

  const allJobs = [
    ...diagnosisJobs,
    ...inspectionFailJobs,
    ...recommendedJobs,
    ...maintenanceJobs,
  ];

  if (allJobs.length > 0) {
    const { error: insertError } = await supabase
      .from('work_order_lines')
      .insert(allJobs);

    if (insertError) {
      console.error('Error inserting job lines:', insertError);
    }
  }
}