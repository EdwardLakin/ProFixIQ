'use client';

import React, { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import { generateCorrectionStory } from '@/lib/generateCorrectionStoryFromInspection';
import { saveWorkOrderLines } from '@/lib/saveWorkOrderLines';
import { RepairLine } from '@/lib/parseRepairOutput';
import WorkOrderEditorPage from '@/components/WorkOrderEditorPage';

const supabase = createBrowserClient<Database>();

export default function InspectionsPage() {
  const [workOrderId, setWorkOrderId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [lines, setLines] = useState<RepairLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // Step 1: Load inspection items
        const { data: items, error: fetchError } = await supabase
          .from('inspection_items')
          .select('*')
          .eq('inspection_id', 'demo-id');

        if (fetchError || !items || items.length === 0) {
          throw new Error('Could not load inspection items');
        }

        // Step 2: Generate correction summary
        const summary = generateCorrectionStory(items);

        // Step 3: Create new work order
        const { data: newOrder, error: orderError } = await supabase
          .from('work_orders')
          .insert({
            user_id: 'demo-user',
            vehicle_id: 'demo-vehicle',
            status: 'generated',
            summary,
          })
          .select()
          .single();

        if (orderError || !newOrder) {
          throw new Error('Failed to create work order.');
        }

        setWorkOrderId(newOrder.id);
        setUserId('demo-user');
        setVehicleId('demo-vehicle');

        // Step 4: Convert inspection items into work order lines
        const parsed: RepairLine[] = items.map((item) => ({
          complaint: item.category || '',
          cause: '',
          correction: item.notes || '',
          tools: [],
          labor_time: '',
        }));

        await saveWorkOrderLines(parsed, 'demo-user', newOrder.id);
        setLines(parsed);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Unexpected error');
      }
    };

    run();
  }, []);

  if (error) {
    return <p className="p-4 text-red-500">{error}</p>;
  }

  if (!workOrderId || lines.length === 0) {
    return <p className="p-4 text-accent">Generating work order from inspection…</p>;
  }

  return (
    <WorkOrderEditorPage
      userId={userId!}
      vehicleId={vehicleId!}
      workOrderId={workOrderId}
      initialLines={lines}
    />
  );
}