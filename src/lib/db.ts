import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/supabase'

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export const getWorkOrderById = async (id: string) => {
  // Fetch work order record
  const { data: order, error: orderError } = await supabase
    .from('work_orders')
    .select('*')
    .eq('id', id)
    .single()

  // Fetch associated lines
  const { data: lines, error: lineError } = await supabase
    .from('work_order_lines')
    .select('*')
    .eq('work_order_id', id)

  if (orderError || lineError) {
    console.error('Error loading work order:', orderError || lineError)
    return null
  }

  return { ...order, lines }
}