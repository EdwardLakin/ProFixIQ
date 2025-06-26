'use client';

import { useEffect } from 'react';
import HomeButton from '@components/ui/HomeButton';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import dispatchCommand from '@lib/inspection/dispatchCommand';
import handleInspectionCommand from '@lib/inspection/handleInspectionCommand';
import inspectionTemplate from '@lib/inspection/templates/maintenance50Point';
import { startListening, stopListening } from '@lib/inspection/voice';
import SectionDisplay from '@components/inspection/SectionDisplay';

export default function MaintenanceInspectionPage() {
  const session = useInspectionSession();
  const {
    inspection,
    updateInspection,
    isListening,
    startSession,
    pauseSession,
  } = session;

  useEffect(() => {
    startSession(inspectionTemplate);
  }, [startSession]);

  const handleVoice = async () => {
    startListening(async (text: string) => {
      const command = await dispatchCommand(text);
      if (command) {
        const updated = handleInspectionCommand(inspection, command);
        updateInspection(updated);
      }
    });
  };

  const pauseVoice = () => {
    stopListening();
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-4xl mx-auto">
        <HomeButton />

        <h1 className="text-3xl md:text-4xl font-black text-orange-400 font-display mb-4 text-center">
          Maintenance 50-Point Inspection
        </h1>

        <div className="flex justify-center gap-4 mb-6">
          <button
            onClick={handleVoice}
            className="bg-green-700 text-white px-6 py-2 rounded-md"
          >
            Start Listening
          </button>
          <button
            onClick={pauseVoice}
            className="bg-yellow-600 text-white px-6 py-2 rounded-md"
          >
            Pause
          </button>
        </div>

        <SectionDisplay />
      </div>
    </div>
  );
}