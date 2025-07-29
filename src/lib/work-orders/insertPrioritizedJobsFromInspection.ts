// lib/work-orders/insertPrioritizedJobsFromInspection.ts

import supabase from '@lib/supabaseClient';
import { Database } from '@/types/supabase';
import { estimateLabor } from '@lib/ai/generateLaborTimeEstimate'; // ✅ Secure client-side call

type Inspection = Database['public']['Tables']['inspections']['Row'];
type WorkOrderLineInsert = Database['public']['Tables']['work_order_lines']['Insert'];
type PartsRequestInsert = Database['public']['Tables']['parts_requests']['Insert'];

export async function insertPrioritizedJobsFromInspection(
  inspectionId: string,
  workOrderId: string,
  vehicleId: string,
  userId: string, // ✅ NEW PARAM
  autoGenerateParts: boolean = true
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

  const allJobs: WorkOrderLineInsert[] = [];
  const jobItemMap: { itemName: string; originalItem: any; jobIndex: number }[] = [];

  const diagnosisKeywords = ['check engine', 'diagnose', 'misfire', 'no start'];
  const maintenanceKeywords = ['oil', 'fluid', 'filter', 'belt', 'coolant'];
  const autoPartsKeywords = ['brake', 'pads', 'rotor', 'fluid', 'coolant', 'filter', 'belt'];

  for (const section of result.sections) {
    for (const item of section.items) {
      const name = item.name?.toLowerCase() || '';
      let jobType: WorkOrderLineInsert['job_type'] = 'repair';

      if (diagnosisKeywords.some(k => name.includes(k))) jobType = 'diagnosis';
      else if (item.status === 'fail') jobType = 'inspection-fail';
      else if (maintenanceKeywords.some(k => name.includes(k))) jobType = 'maintenance';

      const laborTime = await estimateLabor(item.name, jobType); // ✅ Secure AI call

      const complaintParts = [item.name];
      if (item.value) complaintParts.push(`(${item.value}${item.unit || ''})`);
      if (item.notes) complaintParts.push(`- ${item.notes}`);

      const job: WorkOrderLineInsert = {
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: complaintParts.join(' '),
        status: 'queued',
        job_type: jobType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        punched_in_at: null,
        punched_out_at: null,
        hold_reason: null,
        assigned_to: null,
        assigned_tech_id: null,
        labor_time: laborTime ?? null,
      };

      const shouldInclude =
        item.status === 'fail' ||
        item.recommend === true ||
        jobType !== 'repair';

      if (shouldInclude) {
        jobItemMap.push({ itemName: item.name, originalItem: item, jobIndex: allJobs.length });
        allJobs.push(job);
      }
    }
  }

  // Insert jobs and get IDs
  const insertedJobsRes = await supabase
    .from('work_order_lines')
    .insert(allJobs)
    .select('id, complaint');

  if (insertedJobsRes.error) {
    console.error('Error inserting job lines:', insertedJobsRes.error);
    return;
  }

  const insertedJobs = insertedJobsRes.data;
  const partsRequests: PartsRequestInsert[] = [];

  if (autoGenerateParts) {
    for (let i = 0; i < insertedJobs.length; i++) {
      const { complaint, id: jobId } = insertedJobs[i];
      const { originalItem } = jobItemMap[i];

      const lower = complaint.toLowerCase();
      if (autoPartsKeywords.some(k => lower.includes(k))) {
        partsRequests.push({
          id: crypto.randomUUID(),
          job_id: jobId,
          work_order_id: workOrderId,
          part_name: originalItem.name,
          quantity: 1,
          urgency: 'medium',
          notes: 'Auto-generated from inspection',
          photo_urls: [],
          requested_by: userId,
          created_at: new Date().toISOString(),
          viewed_at: null,
          fulfilled_at: null,
          archived: false
        });
      }
    }

    if (partsRequests.length > 0) {
      const { error: partsError } = await supabase
        .from('parts_requests')
        .insert(partsRequests);

      if (partsError) {
        console.error('Error inserting parts requests:', partsError);
      }
    }
  }
}