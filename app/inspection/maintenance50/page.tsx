'use client';

import { useEffect } from 'react';
import HomeButton from '@components/ui/HomeButton';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import handleInspectionCommand from '@lib/inspection/handleInspectionCommand';
import inspectionTemplate from '@lib/inspection/templates/maintenance50Point';
import dispatchCommand from '@lib/inspection/dispatchCommand';
import SectionDisplay from '@components/inspection/SectionDisplay';

export default function MaintenanceInspectionPage() {
  const {
    inspection,
    updateInspection,
    isListening,
    startListening,
    stopListening,
  } = useInspectionSession();

  useEffect(() => {
    updateInspection({
      templateName: 'Maintenance 50 Point',
      date: new Date().toISOString(),
      sections: inspectionTemplate.sections,
      started: true,
      completed: false,
      currentSectionIndex: 0,
    });
    startListening();
  }, []);

  const handleStart = async () => {
    const command = await dispatchCommand('Start Inspection');
    if (command) {
      const updated = handleInspectionCommand(inspection, command);
      updateInspection(updated);
    }
  };

  const handlePause = () => {
    stopListening();
  };

  const handleStatusChange = (itemName: string, status: 'ok' | 'fail' | 'na') => {
    const updated = { ...inspection };
    const items = updated.sections[updated.currentSectionIndex].items;
    const item = items.find((i) => i.name === itemName);
    if (item) item.status = status;
    updateInspection(updated);
  };

  const handleNoteChange = (itemName: string, note: string) => {
    const updated = { ...inspection };
    const items = updated.sections[updated.currentSectionIndex].items;
    const item = items.find((i) => i.name === itemName);
    if (item) item.notes = note;
    updateInspection(updated);
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <HomeButton />
        <h1 className="text-4xl font-black text-orange-400 font-display mb-4 text-center">
          Maintenance 50-Point Inspection
        </h1>

        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={handleStart}
            className="bg-green-700 text-white px-6 py-2 rounded-md"
          >
            Start Listening
          </button>
          <button
            onClick={handlePause}
            className="bg-yellow-600 text-white px-6 py-2 rounded-md"
          >
            Pause
          </button>
        </div>

        <SectionDisplay
          section={inspection.sections[inspection.currentSectionIndex]}
          onStatusChange={handleStatusChange}
          onNoteChange={handleNoteChange}
        />
      </div>
    </div>
  );
}