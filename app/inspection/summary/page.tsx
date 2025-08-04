'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import useInspectionSession from '@hooks/useInspectionSession';
import { generateInspectionPDF } from '@lib/inspection/pdf';
import { generateQuoteFromInspection } from '@lib/quote/generateQuoteFromInspection';
import supabase from '@lib/supabaseClient';
import QuoteViewer from '@components/QuoteViewer';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import HomeButton from '@components/ui/HomeButton';
import type { InspectionItem, InspectionSection, QuoteLineItem } from '@lib/inspection/types';
import type { QuoteLine } from '@lib/quote/generateQuoteFromInspection';

export default function SummaryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inspectionId = searchParams.get('inspectionId');
  const workOrderIdFromUrl = searchParams.get('workOrderId');

  const { session, updateItem, updateQuoteLines } = useInspectionSession();
  const [quoteLines, setQuoteLines] = useState<QuoteLine[]>([]);
  const [summaryText, setSummaryText] = useState('');
  const [workOrderId, setWorkOrderId] = useState<string | null>(workOrderIdFromUrl || null);
  const [isAddingToWorkOrder, setIsAddingToWorkOrder] = useState(false);

  // AI quote generation on load
  useEffect(() => {
    const runQuote = async () => {
      const allItems: InspectionItem[] = session.sections.flatMap((s) => s.items);
      const { summary, quote } = await generateQuoteFromInspection(allItems);

      setSummaryText(summary);
      setQuoteLines(quote);
      updateQuoteLines(
  quote.map((line): QuoteLineItem => ({
    id: crypto.randomUUID(),
    item: line.description,
    partPrice: 0,
    partName: '',
    name: line.description,
    description: line.description,
    notes: '',
    status: 'fail', // default assumption; or replace with real value if available
    laborHours: line.hours,
    price: line.total,
    part: {
      name: '',
      price: 0,
    },
    photoUrls: [],
  }))
);

      if (inspectionId) {
        await supabase
          .from('inspections')
          .update({ quote, summary })
          .eq('id', inspectionId);
      }
    };

    if (session.sections.length > 0) {
      runQuote();
    }
  }, [session, inspectionId, updateQuoteLines]);

  const handleFieldChange = (
    sectionIndex: number,
    itemIndex: number,
    field: keyof InspectionItem,
    value: string
  ) => {
    updateItem(sectionIndex, itemIndex, { [field]: value });
  };

  const hasFailedItems = session.sections.some(section =>
    section.items.some(item => item.status === 'fail' || item.status === 'recommend')
  );

  const createWorkOrderIfNoneExists = async () => {
    if (workOrderId) return workOrderId;

    const newId = uuidv4();
    const { error } = await supabase.from('work_orders').insert([
      {
        id: newId,
        vehicle_id: session.vehicle?.id ?? null,
        inspection_id: inspectionId ?? null,
        created_at: new Date().toISOString(),
        status: 'queued',
        location: session.location ?? 'unspecified',
      },
    ] as any);

    if (!error) {
      setWorkOrderId(newId);
      return newId;
    } else {
      console.error('Error creating work order:', error);
      return null;
    }
  };

  const handleAddToWorkOrder = async () => {
    setIsAddingToWorkOrder(true);
    const id = await createWorkOrderIfNoneExists();
    if (!id || !inspectionId) return;

    const response = await fetch('/api/work-orders/from-inspection', {
      method: 'POST',
      body: JSON.stringify({
        inspectionId,
        workOrderId: id,
        vehicleId: session.vehicle?.id,
      }),
    });

    if (response.ok) {
      alert('Jobs added to work order successfully!');
    } else {
      alert('Failed to add jobs to work order.');
    }

    setIsAddingToWorkOrder(false);
  };

  const handleSubmit = async () => {
    try {
      const pdfBlob = await generateInspectionPDF(session);
      const blob = new Blob([pdfBlob], { type: 'application/pdf' });

      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = 'inspection_summary.pdf';
      link.click();

      localStorage.removeItem('inspectionCustomer');
      localStorage.removeItem('inspectionVehicle');

      alert('Inspection submitted and PDF downloaded.');
      router.push('/inspection/menu');
    } catch (error) {
      console.error('Submission error:', error);
      alert('Failed to submit inspection.');
    }
  };

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        <PreviousPageButton to="/inspection/menu" />
        <HomeButton />
      </div>

      <div className="bg-zinc-800 text-white p-4 rounded mb-6">
        <h2 className="text-xl font-bold mb-2">Customer Info</h2>
        <p>Name: {session.customer?.first_name} {session.customer?.last_name}</p>
        <p>Phone: {session.customer?.phone}</p>
        <p>Email: {session.customer?.email}</p>

        <h2 className="text-xl font-bold mt-4 mb-2">Vehicle Info</h2>
        <p>Year/Make/Model: {session.vehicle?.year} {session.vehicle?.make} {session.vehicle?.model}</p>
        <p>VIN: {session.vehicle?.vin}</p>
        <p>License Plate: {session.vehicle?.license_plate}</p>
        <p>Mileage: {session.vehicle?.mileage}</p>
        <p>Color: {session.vehicle?.color}</p>
      </div>

      {/* Editable inspection sections */}
      {session.sections.map((section: InspectionSection, sectionIndex: number) => (
        <div key={sectionIndex} className="mb-6 border rounded-md">
          <div className="bg-gray-200 px-4 py-2 font-bold">{section.title}</div>
          <div className="p-4 space-y-6">
            {section.items.map((item: InspectionItem, itemIndex: number) => (
              <div key={itemIndex} className="border-b pb-4 space-y-2">
                <div className="font-semibold">{item.name}</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <label className="flex flex-col">
                    Status
                    <select
                      className="border rounded p-1"
                      value={item?.status ?? ''}
                      onChange={(e) =>
                        handleFieldChange(sectionIndex, itemIndex, 'status', e.target.value)
                      }
                    >
                      <option value="">Select</option>
                      <option value="ok">OK</option>
                      <option value="fail">Fail</option>
                      <option value="na">N/A</option>
                      <option value="recommend">Recommend</option>
                    </select>
                  </label>

                  <label className="flex flex-col">
                    Note
                    <input
                      className="border rounded p-1"
                      value={item?.notes || ''}
                      onChange={(e) =>
                        handleFieldChange(sectionIndex, itemIndex, 'notes', e.target.value)
                      }
                    />
                  </label>

                  <label className="flex flex-col">
                    Value
                    <input
                      className="border rounded p-1"
                      value={item?.value || ''}
                      onChange={(e) =>
                        handleFieldChange(sectionIndex, itemIndex, 'value', e.target.value)
                      }
                    />
                  </label>

                  <label className="flex flex-col">
                    Unit
                    <input
                      className="border rounded p-1"
                      value={item?.unit || ''}
                      onChange={(e) =>
                        handleFieldChange(sectionIndex, itemIndex, 'unit', e.target.value)
                      }
                    />
                  </label>
                </div>

                {Array.isArray(item?.photoUrls) && item.photoUrls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.photoUrls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt="Uploaded"
                        className="max-h-32 rounded border border-white/20"
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Quote viewer from AI */}
      {quoteLines.length > 0 && (
        <div className="my-6">
          <QuoteViewer summary={summaryText} quote={quoteLines} />
        </div>
      )}

      {hasFailedItems && (
        <button
          onClick={handleAddToWorkOrder}
          disabled={isAddingToWorkOrder}
          className="w-full bg-orange-600 text-white py-3 rounded-md font-bold text-lg mt-4"
        >
          {isAddingToWorkOrder ? 'Adding to Work Order...' : 'Add to Work Order'}
        </button>
      )}

      <button
        onClick={handleSubmit}
        className="w-full bg-green-600 text-white py-3 rounded-md font-bold text-lg mt-4"
      >
        Submit Inspection
      </button>
    </div>
  );
}