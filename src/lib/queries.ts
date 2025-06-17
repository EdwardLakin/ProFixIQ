import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/supabase'

const supabase = createBrowserClient<Database>()

// ✅ Get the current job assigned to a technician that is not completed
export const getCurrentJobForTech = async (techId: string) => {
  const { data, error } = await supabase
    .from('work_order_lines')
    .select(`
      id,
      complaint,
      status,
      vehicle:vehicle_id (
        year,
        make,
        model,
        vin
      )
    `)
    .eq('assigned_tech_id', techId)
    .in('status', ['in_progress', 'on_hold', 'awaiting_parts']) // customize this list if needed
    .order('updated_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    console.error('[getCurrentJobForTech]', error.message)
    return null
  }

  return data
}