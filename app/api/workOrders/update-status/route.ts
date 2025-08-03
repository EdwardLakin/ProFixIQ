import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase'; // Make sure this exists

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Command = 'punch-in' | 'complete';

type QuoteLineItem = {
  name: string;
  description?: string;
  labor_time?: number;
  part_name?: string;
  part_price?: number;
  parts_cost?: number;
  total_price?: number;
};

interface RequestBody {
  workOrderId: string;
  command: Command;
  quote?: QuoteLineItem[];
  summary?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();

    const { workOrderId, command, quote, summary } = body;

    if (!workOrderId || !command) {
      return NextResponse.json({ error: 'Missing workOrderId or command' }, { status: 400 });
    }

    let updateFields: Partial<Database['public']['Tables']['work_orders']['Update']> = {};

    if (command === 'punch-in') {
      updateFields = {
        status: 'in_progress',
        started_at: new Date().toISOString(),
      };
    } else if (command === 'complete') {
      updateFields = {
        status: 'completed',
        completed_at: new Date().toISOString(),
      };

      if (quote && summary) {
        updateFields.quote = {
          summary,
          items: quote,
        };
      }
    } else {
      return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
    }

    const { error } = await supabase
      .from('work_orders')
      .update(updateFields)
      .eq('id', workOrderId);

    if (error) throw error;

    return NextResponse.json({ success: true, updated: updateFields });
  } catch (err: any) {
    console.error('Work order update failed:', err.message || err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}