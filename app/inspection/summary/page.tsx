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
      body: JSON.stringify(summary),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (result.attachedWorkOrder) {
      router.push(`/app/workorders/${result.workOrderId}`);
    } else if (result.pdfUrl) {
      window.open(result.pdfUrl, '_blank');
    } else {
      alert('Failed to process summary');
    }
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-black text-orange-400 font-display mb-6">
          Inspection Summary
        </h1>

        <SummaryComponent />

        <div className="flex justify-end mt-8 gap-4">
          <Link href="/inspection/start">
            <button className="bg-gray-600 text-white px-6 py-2 rounded-md">Back</button>
          </Link>
          <button
            onClick={handleSubmit}
            className="bg-orange-600 text-white px-6 py-2 rounded-md hover:bg-orange-500"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}