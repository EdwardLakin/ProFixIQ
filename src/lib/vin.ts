import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';

const supabase = createBrowserClient<Database>();

export async function saveDecodedVIN({
  userId,
  vin,
  decodedData,
}: {
  userId: string;
  vin: string;
  decodedData: any;
}) {
  const { error } = await supabase.from('decoded_vins').insert([
    {
      user_id: userId,
      vin,
      decoded: decodedData,
    },
  ]);

  if (error) {
    console.error('Error saving decoded VIN:', error.message);
    throw new Error('Failed to save decoded VIN');
  }
}