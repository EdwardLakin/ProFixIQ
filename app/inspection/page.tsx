// src/app/inspection/page.tsx

'use client';

import { useEffect, useState } from 'react';
import maintenance50Point from '@lib/inspection/templates/maintenance50Point';
import { loadInspectionState, saveInspectionState } from '@lib/inspection/inspectionState';
import { InspectionState, InspectionStatus } from '@lib/inspection/types';
import { v4 as uuidv4 } from 'uuid';

export default function InspectionPage() {
  const [inspection, setInspection] = useState<InspectionState | null>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const loaded = loadInspectionState();
    if (loaded) {
      setInspection(loaded);
    } else {
      // Init inspection state
      const initialized: InspectionState = {
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sections: {},
      };
      for (const section in maintenance50Point) {
        initialized.sections[section] = {};
        maintenance50Point[section].forEach((item) => {
          initialized.sections[section][item] = {
            status: 'ok',
            notes: [],
          };
        });
      }
      setInspection(initialized);
      saveInspectionState(initialized);
    }
  }, []);

  const updateItem = (section: string, item: string, status: InspectionStatus) => {
    if (!inspection) return;
    const updated = { ...inspection };
    updated.sections[section][item].status = status;
    updated.updatedAt = new Date().toISOString();
    saveInspectionState(updated);
    setInspection(updated);
  };

  const updateNote = (section: string, item: string, note: string) => {
    if (!inspection) return;
    const updated = { ...inspection };
    updated.sections[section][item].notes = [note];
    updated.updatedAt = new Date().toISOString();
    saveInspectionState(updated);
    setInspection(updated);
  };

  const addPicture = (section: string, item: string) => {
    alert(`Add picture functionality coming soon for ${section} - ${item}`);
  };

  if (!inspection) return <div className="text-white p-6">Loading inspection...</div>;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white px-4 py-6 font-blackops">
      <h1 className="text-3xl mb-4">Maintenance 50-Point Inspection</h1>
      <button
        onClick={() => setListening((prev) => !prev)}
        className={`mb-6 px-4 py-2 rounded-md font-bold ${
          listening ? 'bg-red-600' : 'bg-green-600'
        }`}
      >
        {listening ? 'Pause Listening' : 'Start Listening'}
      </button>

      <div className="space-y-6">
        {Object.entries(inspection.sections).map(([section, items]) => (
          <div key={section}>
            <h2 className="text-xl text-orange-400 mb-2">{section}</h2>
            <div className="space-y-4 pl-4">
              {Object.entries(items).map(([item, result]) => (
                <div key={item} className="bg-black/30 p-3 rounded-lg shadow-inner">
                  <div className="flex justify-between items-center">
                    <div className="text-lg font-semibold">{item}</div>
                    <div className="flex gap-2">
                      <button
                        className="bg-green-600 px-3 py-1 rounded-md"
                        onClick={() => updateItem(section, item, 'ok')}
                      >
                        OK
                      </button>
                      <button
                        className="bg-red-600 px-3 py-1 rounded-md"
                        onClick={() => updateItem(section, item, 'fail')}
                      >
                        FAIL
                      </button>
                      <button
                        className="bg-orange-500 px-3 py-1 rounded-md"
                        onClick={() => updateItem(section, item, 'na')}
                      >
                        N/A
                      </button>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Notes..."
                    className="w-full mt-2 p-2 bg-black/20 rounded-md text-white"
                    value={result.notes?.[0] || ''}
                    onChange={(e) => updateNote(section, item, e.target.value)}
                  />

                  {result.status === 'fail' && (
                    <button
                      onClick={() => addPicture(section, item)}
                      className="mt-2 px-3 py-1 bg-blue-600 rounded-md"
                    >
                      Add Picture
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => alert('Finish inspection logic goes here')}
        className="mt-10 bg-orange-600 px-6 py-3 text-xl rounded-md"
      >
        Finish Inspection
      </button>
    </div>
  );
}