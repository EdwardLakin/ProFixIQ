'use client';

import { useEffect, useRef } from 'react';
import HomeButton from '@components/ui/HomeButton';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import handleInspectionCommand from '@lib/inspection/handleInspectionCommand';
import inspectionTemplate from '@lib/inspection/templates/maintenance50Point';
import dispatchCommand from '@lib/inspection/dispatchCommand';
import SectionDisplay from '@components/inspection/SectionDisplay';
import { useRouter } from 'next/navigation';

export default function MaintenanceInspectionPage() {
  const {
    inspection,
    updateInspection,
    isListening,
    startListening,
    stopListening,
  } = useInspectionSession();

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPhotoItem = useRef<string | null>(null);

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
    if (isListening) stopListening();
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

  const handleAddPhoto = (itemName: string) => {
    pendingPhotoItem.current = itemName;
    fileInputRef.current?.click();
  };

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const reader = new FileReader();

    reader.onloadend = () => {
      const updated = { ...inspection };
      const items = updated.sections[updated.currentSectionIndex].items;
      const item = items.find((i) => i.name === pendingPhotoItem.current);
      if (item) item.photo = reader.result as string;
      updateInspection(updated);
    };

    if (file) reader.readAsDataURL(file);
  };

  const handleFinish = () => {
    stopListening();
    updateInspection({ ...inspection, completed: true });
    router.push('/inspection/summary');
  };

  const isLastSection =
    inspection.currentSectionIndex === inspection.sections.length - 1;

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

        {inspection.sections.length > 0 && (
          <>
            <SectionDisplay
              section={inspection.sections[inspection.currentSectionIndex]}
              onStatusChange={handleStatusChange}
              onNoteChange={handleNoteChange}
              onAddPhoto={handleAddPhoto}
            />

            {isLastSection && (
              <button
                onClick={handleFinish}
                className="bg-orange-600 text-white px-6 py-2 rounded-md mt-6"
              >
                Finish Inspection
              </button>
            )}

            {!isLastSection && (
              <div className="flex justify-between mt-6">
                <button
                  onClick={() =>
                    updateInspection({
                      ...inspection,
                      currentSectionIndex: Math.max(0, inspection.currentSectionIndex - 1),
                    })
                  }
                  className="bg-gray-700 px-4 py-2 rounded text-white disabled:opacity-50"
                  disabled={inspection.currentSectionIndex === 0}
                >
                  ← Previous
                </button>

                <button
                  onClick={() =>
                    updateInspection({
                      ...inspection,
                      currentSectionIndex: Math.min(
                        inspection.sections.length - 1,
                        inspection.currentSectionIndex + 1
                      ),
                    })
                  }
                  className="bg-gray-700 px-4 py-2 rounded text-white disabled:opacity-50"
                  disabled={inspection.currentSectionIndex >= inspection.sections.length - 1}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}

        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handlePhotoSelected}
        />
      </div>
    </div>
  );
}