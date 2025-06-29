import { supabase } from '@lib/supabaseClient';
import { InspectionSession } from './types';
import { Database } from '@custom-types/supabase'; // Adjust if your type path is different

type InspectionInsert = Database['public']['Tables']['inspections']['Insert'];

export async function saveInspection(session: InspectionSession) {
  const payload: InspectionInsert = {
    user_id: session.customerId ?? 'unknown',
    vehicle: session.vehicleId ?? null,
    template: session.templateName,
    result: session as any, // Cast if `result` column is JSONB
  };

  const { data, error } = await supabase
    .from('inspections')
    .insert(payload);

  if (error) {
    console.error('Error saving inspection session:', error.message);
  }

  return { data, error };
}