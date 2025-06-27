'use client';

import { useRouter } from 'next/navigation';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { InspectionStatus } from '@lib/inspection/types';
import HomeButton from '@components/ui/HomeButton';

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
    router.push('/workorders'); // or wherever you want to go next
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <HomeButton />
        <h1 className="text-4xl font-black text-orange-400 font-display mb-4 text-center">
          Inspection Summary
        </h1>

        {inspection.sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            <h2 className="text-2xl text-orange-300 font-semibold mb-2">{section.title}</h2>
            {section.items.map((item, itemIndex) => (
              <div
                key={itemIndex}
                className="bg-white/10 p-4 rounded-md mb-4 border border-white/10"
              >
                <div className="flex justify-between items-center">
                  <p className="font-semibold">{item.name}</p>
                  <div className="space-x-2">
                    {(['ok', 'fail', 'na'] as const).map((status) => (
                      <button
                        key={status}
                        onClick={() =>
                          handleStatusChange(sectionIndex, itemIndex, status)
                        }
                        className={`px-3 py-1 rounded ${
                          item.status === status
                            ? 'bg-orange-500 text-white'
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
                  className="mt-2 w-full bg-black/30 text-white p-2 rounded border border-gray-700"
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