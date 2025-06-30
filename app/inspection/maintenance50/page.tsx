'use client';

import { useEffect } from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import maintenance50 from '@lib/inspection/templates/maintenance50Point';
import PreviousPageButton from '@components/ui/PreviousPageButton';

function isPhotoRequired(status: string) {
  return status === 'fail' || status === 'recommend';
}

export default function Maintenance50Inspection() {
  const {
    session,
    updateItem,
    finishSession,
    startSession,
    pauseSession,
    resumeSession,
  } = useInspectionSession(maintenance50);

  useEffect(() => {
    startSession();
    return () => pauseSession();
  }, []);

  return (
    <div className="p-4 text-white">
      <PreviousPageButton />
      <h1 className="text-3xl font-black text-center w-full -ml-10">
        Maintenance 50 Point Inspection
      </h1>

      {session.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="mb-6 mt-8">
          <h2 className="text-2xl font-bold mb-2">{section.section}</h2>
          {section.items.map((item, itemIndex) => (
            <div key={itemIndex} className="mb-4 border-b border-gray-700 pb-2">
              <h3 className="text-lg font-semibold mb-2">{item.item}</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  className="bg-green-600 px-4 py-2 rounded"
                  onClick={() =>
                    updateItem({
                      sectionIndex,
                       itemIndex,
                       updates: { status: 'ok' }
                    })
                  }
                >
                    OK
                  </button>
                <button
                  className="bg-yellow-500 text-black px-4 py-2 rounded"
                  onClick={() =>
                    updateItem({
                      sectionIndex,
                       itemIndex,
                       updates: { status: 'fail' },
                    })
                  }
                >
                  FAIL
                </button>
                <button
                  className="bg-purple-600 px-4 py-2 rounded"
                  onClick={() =>
                     updateItem({
                      sectionIndex,
                       itemIndex,
                       updates: { status: 'na' }
                     })
                    }
                >
                  N/A
                </button>
                <button
                  className="bg-orange-600 px-4 py-2 rounded"
                  onClick={() => 
                    updateItem({
                    sectionIndex,
                    itemIndex,
                    updates: { status: 'recommend' }
                    })
                  }
                >
                  Recommend
                </button>
              </div>
              {isPhotoRequired(item.status ?? '') && (
                <button className="bg-blue-600 px-4 py-2 rounded">
                  Add Photo
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      <div className="flex justify-end">
        <button
          onClick={finishSession}
          className="bg-red-600 text-white px-6 py-3 rounded mt-6"
        >
          Finish Inspection
        </button>
      </div>
    </div>
  );
}