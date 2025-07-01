import { supabase } from '@lib/supabaseClient'
import { InspectionSession } from '@lib/inspection/types'

export async function saveInspectionSession(session: InspectionSession) {
  try {
    const payload = {
      id: session.id,
      user_id: session.customerId,
      vehicle_id: session.vehicleId,
      quote_id: session.quote?.[0]?.id || null,
      template_id: session.templateId,
      template: session.templateName || '',
      result: session.sections ? JSON.stringify(session.sections) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('inspections')
      .upsert([payload], { onConflict: 'id' })

    if (error) throw error

    return { success: true, data }
  } catch (err) {
    console.error('Error saving inspection session:', err)
    return { success: false, error: err }
  }
}