import { NextResponse } from 'next/server';
import { supabase } from '@lib/supabaseClient';
import { generateInspectionPDF } from '@lib/inspection/pdf';
import { InspectionSummaryItem } from '@lib/inspection/summary';
import { writeFileSync } from 'fs';
import { join } from 'path';

export async function POST(req: Request) {
  const body = await req.json();
  const summary: InspectionSummaryItem[] = body.summary;
  const workOrderId: string | undefined = body.workOrderId;

  if (!summary || !Array.isArray(summary)) {
    return NextResponse.json({ error: 'Invalid summary' }, { status: 400 });
  }

  if (workOrderId) {
    const { data, error } = await supabase
      .from('work_order_lines')
      .insert(
        summary.map(item => ({
          work_order_id: workOrderId,
          description: `${item.section} - ${item.item}: ${item.status}`,
          notes: item.note || '',
          status: item.status,
        }))
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ attachedToWorkOrder: true, workOrderId });
  }

  // For standalone: generate and save PDF
  const pdfBuffer = await generateInspectionPDF(summary);

  const filename = `inspection-${Date.now()}.pdf`;
  const filepath = join(process.cwd(), 'public', filename);

  writeFileSync(filepath, pdfBuffer);

  return NextResponse.json({
    attachedToWorkOrder: false,
    pdfUrl: `/${filename}`,
  });
}