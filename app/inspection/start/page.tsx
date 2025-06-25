'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import HomeButton from '@components/ui/HomeButton';
import PreviousButton from '@components/ui/PreviousPageButton';
import Button from '@components/ui/Button';
import maintenance50 from '@lib/inspection/templates/maintenance50Point';

const templates: Record<string, any> = {
  maintenance50,
};

type ItemStatus = 'ok' | 'fail' | 'na';

export default function InspectionStartPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const templateKey = searchParams.get('template');
  const [inspection, setInspection] = useState<any[]>([]);
  const [started, setStarted] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, { status: ItemStatus; notes: string }>>({});

  useEffect(() => {
    if (templateKey && templates[templateKey]) {
      setInspection(templates[templateKey]);
    }
  }, [templateKey]);

  const handleStatus = (section: string, item: string, status: ItemStatus) => {
    const key = `${section}__${item}`;
    setStatuses((prev) => ({
      ...prev,
      [key]: { ...prev[key], status },
    }));
  };

  const handleNoteChange = (section: string, item: string, value: string) => {
    const key = `${section}__${item}`;
    setStatuses((prev) => ({
      ...prev,
      [key]: { ...prev[key], notes: value },
    }));
  };

  const handleFinish = () => {
    const result = inspection.flatMap((section: any) =>
      section.items.map((item: string) => {
        const key = `${section.section}__${item}`;
        const record = statuses[key] || { status: 'ok', notes: '' };
        return {
          section: section.section,
          item,
          ...record,
        };
      })
    );

    // Route to summary or log result
    console.log('Inspection Result:', result);
    router.push('/inspection/summary');
  };

  return (
    <div className="min-h-screen p-6 text-white">
      <h1 className="text-3xl font-black tracking-wide mb-6">Inspection: {templateKey}</h1>

      {!started ? (
        <div className="flex justify-center my-10">
          <Button className="text-xl px-8 py-4 bg-orange-600" onClick={() => setStarted(true)}>
            Start Inspection
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {inspection.map((section, i) => (
            <div key={i}>
              <h2 className="text-xl font-bold mb-2">{section.section}</h2>
              <ul className="space-y-4">
                {section.items.map((item: string, j: number) => {
                  const key = `${section.section}__${item}`;
                  const current = statuses[key]?.status;

                  return (
                    <li key={j} className="bg-white/10 p-4 rounded">
                      <div className="flex justify-between items-center">
                        <span>{item}</span>
                        <div className="flex gap-2">
                          <Button
                            className={`px-3 py-1 ${current === 'ok' ? 'bg-green-600' : 'bg-gray-700'}`}
                            onClick={() => handleStatus(section.section, item, 'ok')}
                          >
                            OK
                          </Button>
                          <Button
                            className={`px-3 py-1 ${current === 'fail' ? 'bg-red-600' : 'bg-gray-700'}`}
                            onClick={() => handleStatus(section.section, item, 'fail')}
                          >
                            FAIL
                          </Button>
                          <Button
                            className={`px-3 py-1 ${current === 'na' ? 'bg-yellow-600' : 'bg-gray-700'}`}
                            onClick={() => handleStatus(section.section, item, 'na')}
                          >
                            N/A
                          </Button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Notes..."
                        className="mt-2 w-full p-2 bg-black/30 rounded text-white"
                        value={statuses[key]?.notes || ''}
                        onChange={(e) => handleNoteChange(section.section, item, e.target.value)}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="flex justify-center mt-10">
            <Button className="text-xl px-8 py-4 bg-blue-600" onClick={handleFinish}>
              Finish Inspection
            </Button>
          </div>
        </div>
      )}

      <div className="absolute top-4 left-4">
        <HomeButton />
      </div>
      <div className="absolute top-4 right-4">
        <PreviousButton to="/inspection/menu" />
      </div>
    </div>
  );
}