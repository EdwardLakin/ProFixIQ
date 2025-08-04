import supabase from './supabaseClient';
import type { QuoteLineItem } from '@lib/inspection/types';

export async function updateQuoteLine(line: QuoteLineItem) {
  const {
    item,
    partPrice,
    partName,
    name,
    description,
    notes,
    status,
    laborHours,
    price,
    part,
    photoUrls,
  } = line;

  const { error } = await supabase.from('quote_lines').upsert({
    id: line.id, // ensure `id` exists in your DB
    item,
    part_price: partPrice ?? part?.price ?? 0,
    part_name: partName ?? part?.name ?? '',
    name,
    description,
    notes,
    status,
    labor_time: laborHours ?? 0,
    price,
    photo_urls: photoUrls ?? [],
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error('❌ Error saving quote line:', error.message);
    throw error;
  }
}