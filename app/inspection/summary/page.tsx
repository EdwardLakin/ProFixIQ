'use client';

import { useRouter } from 'next/navigation';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { InspectionStatus } from '@lib/inspection/types';
import HomeButton from '@components/ui/HomeButton';
import PreviousPageButton from '@components/ui/PreviousPageButton';

export default function SummaryPage() {
  const { inspection, updateInspection } = useInspectionSession();
  const router = useRouter();

  const handleStatusChange = (
    sectionIndex: number,
    itemIndex: number,
    status: InspectionStatus
  ) => {
    const updated = { ...inspection };
    updated.sections[sectionIndex].items[itemIndex].status = status;
    updateInspection(updated);
  };

  const handleNoteChange = (
    sectionIndex: number,
    itemIndex: number,
    note: string
  ) => {
    const updated = { ...inspection };
    updated.sections[sectionIndex].items[itemIndex].notes = note;
    updateInspection(updated);
  };

  const handleSubmit = () => {
    console.log('Final inspection:', inspection);

    // 🔧 Placeholder for PDF/export/email logic
    // generatePDF(inspection); emailCustomer(); attachToWorkOrder();

    router.push('/workorders');
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <HomeButton />
          <PreviousPageButton />
        </div>

        <h1 className="text-4xl font-black text-orange-400 font-display mb-4 text-center">
          Inspection Summary
        </h1>

        {inspection.sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            <h2 className="text-2xl text-orange-500 font-semibold mb-2">{section.title}</h2>

            <div className="bg-white/10 p-4 rounded-md mb-4 border border-white/10">
              {section.items.map((item, itemIndex) => (
                <div key={itemIndex} className="mb-6">
                  <div className="flex justify-between items-center">
                    <p className="font-semibold">{item.name}</p>
                    <div className="space-x-2">
                      {(['ok', 'fail', 'na'] as const).map((status) => (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(sectionIndex, itemIndex, status)}
                          className={`px-3 py-1 rounded ${
                            item.status === status
                              ? status === 'ok'
                                ? 'bg-green-600 text-white'
                                : status === 'fail'
                                ? 'bg-red-600 text-white'
                                : 'bg-yellow-500 text-white'
                              : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          {status.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    placeholder="Notes..."
                    className="mt-2 w-full bg-black/50 text-white p-2 rounded border border-gray-700"
                    value={item.notes || ''}
                    onChange={(e) =>
                      handleNoteChange(sectionIndex, itemIndex, e.target.value)
                    }
                  />

                  {item.photo && (
                    <img
                      src={item.photo}
                      alt="Uploaded"
                      className="mt-2 max-h-32 rounded border border-white/20"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <button
          onClick={handleSubmit}
          className="w-full bg-green-600 text-white py-3 rounded-md font-bold text-lg mt-8"
        >
          Submit Inspection
        </button>
      </div>
    </div>
  );
}