import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// Use your environment variables
const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface UserSettings {
  laborRate: number;
  partsMarkup: number;
  shopSuppliesFlatFee: number;
}

export async function getUserSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('shop_profiles')
    .select('laborRate, partsMarkup, shopSuppliesFlatFee')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('Shop settings not found.');

  return data as UserSettings;
}

// Fallback settings
export const userSettings: UserSettings = {
  laborRate: 120,
  partsMarkup: 1.3,
  shopSuppliesFlatFee: 5.0,
};