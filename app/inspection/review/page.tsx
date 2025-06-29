'use client';

import React from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import HomeButton from '@components/ui/HomeButton';
import { useRouter } from 'next/navigation';

const ReviewPage = () => {
  const router = useRouter();
  const { session } = useInspectionSession();

  const handleSubmit = () => {
    router.push('/inspection/summary');
  };

  return (
    <div className="min-h-screen bg-black bg-opacity-80 text-white px-4 py-6">
      <HomeButton />
      <h1 className="text-3xl font-bold text-center mb-6 font-blackops">Review Inspection</h1>
      <div className="bg-white bg-opacity-5 rounded-lg p-4 max-w-3xl mx-auto space-y-6">
        {session.sections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            <h2 className="text-xl font-semibold text-orange-400 mb-2">
              Section {sectionIndex + 1}: {section.section}
            </h2>
            <ul className="space-y-2">
              {section.items.map((item, itemIndex) => (
                <li key={itemIndex} className="border border-white border-opacity-20 rounded p-2">
                  <p className="font-bold">{item.item}</p>
                  <p>Status: {item.status ?? 'N/A'}</p>
                  {item.value && <p>Value: {item.value} {item.unit}</p>}
                  {item.note && <p>Notes: {item.note}</p>}
                  {item.recommend?.length ? (
                    <p>Recommend: {item.recommend.join(', ')}</p>
                  ) : null}
                  {item.photoUrls?.length ? (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {item.photoUrls.map((url, i) => (
                        <img key={i} src={url} alt="Photo" className="w-24 h-24 rounded object-cover" />
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-8">
        <button
          onClick={handleSubmit}
          className="bg-orange-500 hover:bg-orange-600 text-white font-blackops px-6 py-2 rounded"
        >
          Submit & Generate Summary
        </button>
      </div>
    </div>
  );
};

export default ReviewPage;