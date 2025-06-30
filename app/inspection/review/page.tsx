// app/inspection/review/page.tsx

'use client';

import HomeButton from '@components/ui/HomeButton';
import { useRouter } from 'next/navigation';
import useInspectionSession from '@lib/inspection/useInspectionSession';

export default function ReviewPage() {
  const router = useRouter();

  // If you're just reviewing the session and not starting a new one,
  // pass `null as any` or restructure the hook to not require a template here.
  const { session } = useInspectionSession( null as any );

  const handleSubmit = () => {
    router.push('/inspection/summary');
  };

  return (
    <div className="min-h-screen bg-black bg-opacity-80 text-white px-4 py-6">
      <HomeButton />
      <h1 className="text-3xl font-bold text-center mb-4 font-blackops">Review Inspection</h1>
      <div className="bg-white bg-opacity-5 rounded-md p-4 max-w-3xl mx-auto space-y-6">
        {session.sections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            <h2 className="text-xl font-semibold text-orange-400 mb-2">
              Section {sectionIndex + 1}: {section.section}
            </h2>
            <div className="space-y-2">
              {section.items.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className="border border-white border-opacity-20 rounded p-2"
                >
                  <p className="font-bold">{item.item}</p>
                  <p>Status: {item.status || 'N/A'}</p>
                  {item.value && <p>Value: {item.value} {item.unit || ''}</p>}
                  {item.note && <p className="italic text-sm text-gray-300">Notes: {item.note}</p>}
                  {item.recommend && item.recommend.length > 0 && (
                    <p className="text-yellow-400">
                      Recommendations: {item.recommend.join(', ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-6">
        <button
          onClick={handleSubmit}
          className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded font-blackops text-lg"
        >
          Submit Inspection
        </button>
      </div>
    </div>
  );
}