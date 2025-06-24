'use client';

import { useRouter } from 'next/navigation';
import { generateInspectionSummary } from '@lib/inspection/summary';
import SummaryComponent from '@components/summary';
import Link from 'next/link';

export default function InspectionSummaryPage() {
  const router = useRouter();

  const handleSubmit = async () => {
    const summary = generateInspectionSummary();

    const response = await fetch('/api/inspection/submit', {
      method: 'POST',
      body: JSON.stringify({ summary }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (result.attachedToWorkOrder) {
      router.push(`/app/workorders/${result.workOrderId}`);
    } else if (result.pdfUrl) {
      window.open(result.pdfUrl, '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-black text-orange-400 font-display mb-6">
          Inspection Summary
        </h1>

        <SummaryComponent />

        <div className="mt-8 flex gap-4">
          <Link
            href="/app/inspection"
            className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-4 rounded transition"
          >
            Back to Inspection
          </Link>

          <button
            onClick={handleSubmit}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded"
          >
            Submit Summary
          </button>
        </div>
      </div>
    </div>
  );
}