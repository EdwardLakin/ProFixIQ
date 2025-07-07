'use client';

import { useRouter } from 'next/navigation';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import {
  type InspectionItem,
  type InspectionSection,
} from '@lib/inspection/types';
import { generateInspectionPDF } from '@lib/inspection/pdf';
import HomeButton from '@components/ui/HomeButton';
import PreviousPageButton from '@components/ui/PreviousPageButton';

export default function SummaryPage() {
  const { session, updateItem } = useInspectionSession();
  const router = useRouter();

  const handleFieldChange = (
    sectionIndex: number,
    itemIndex: number,
    field: keyof InspectionItem,
    value: string
  ) => {
    updateItem(sectionIndex, itemIndex, { [field]: value });
  };

  const handleSubmit = async () => {
    const pdfBlob = await generateInspectionPDF(session);
    const blob = new Blob([pdfBlob], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = 'inspection_summary.pdf';
    link.click();
  };

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
         <PreviousPageButton to="/inspection/menu" />       
        <HomeButton />
      </div>

      {session.sections.map((section: InspectionSection, sectionIndex: number) => (
        <div key={sectionIndex} className="mb-6 border rounded-md">
          <div className="bg-gray-200 px-4 py-2 text-left font-bold">
            {section.title}
          </div>

          <div className="p-4 space-y-6">
            {section.items.map((item: InspectionItem, itemIndex: number) => (
              <div key={itemIndex} className="border-b pb-4 space-y-2">
                <div className="font-semibold">{item.name}</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <label className="flex flex-col">
                    Status
                    <select
                      className="border rounded p-1"
                      value={item?.status}
                      onChange={(e) =>
                        handleFieldChange(sectionIndex, itemIndex, 'status', e.target.value)
                      }
                    >
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

                {Array.isArray(item?.photoUrls) && item?.photoUrls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item?.photoUrls.map((url, i) => (
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

      <button
        onClick={handleSubmit}
        className="w-full bg-green-600 text-white py-3 rounded-md font-bold text-lg mt-8"
      >
        Submit Inspection
      </button>
    </div>
  );
}