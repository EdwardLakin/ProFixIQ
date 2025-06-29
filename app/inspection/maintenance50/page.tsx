'use client';

import { useEffect, useState } from 'react';
import HomeButton from '@components/ui/HomeButton';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import handleInspectionCommand from '@lib/inspection/handleInspectionCommand';
import inspectionTemplate from '@lib/inspection/templates/maintenance50Point';
import { dispatchCommand } from '@lib/inspection/dispatchCommand';
import SectionDisplay from '@components/inspection/SectionDisplay';
import { useRouter } from 'next/navigation';

export default function MaintenanceInspectionPage() {
  const router = useRouter();

  const {
    session,
    updateSession,
    startListening,
    stopListening,
    pauseListening,
    transcript,
    isListening,
  } = useInspectionSession(inspectionTemplate);

  useEffect(() => {
    if (!session?.inspection) return;
    const firstSection = session.inspection.sections[0];
    if (firstSection) {
      const command = {
        type: 'navigate',
        sectionId: firstSection.id,
      } as const;
      const updated = dispatchCommand(command, session);
      if (updated) updateSession(updated);
    }
  }, [session]);

  const handleCommand = (command: any) => {
    const updated = handleInspectionCommand(command, session);
    if (updated) updateSession(updated);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0f0f0f] to-[#1a1a1a] text-white px-4 py-6 font-['Black_Ops_One']">
      <HomeButton />
      <h1 className="text-4xl text-center mb-4">Maintenance 50 Point Inspection</h1>

      <div className="flex justify-center space-x-4 mb-6">
        <button
          onClick={startListening}
          className="bg-orange-600 px-4 py-2 rounded shadow hover:bg-orange-700"
        >
          Start Listening
        </button>
        <button
          onClick={pauseListening}
          className="bg-yellow-600 px-4 py-2 rounded shadow hover:bg-yellow-700"
        >
          Pause
        </button>
        <button
          onClick={stopListening}
          className="bg-red-600 px-4 py-2 rounded shadow hover:bg-red-700"
        >
          Stop
        </button>
      </div>

      <div className="text-center text-sm mb-6 italic text-gray-300">
        {isListening ? 'Listening...' : 'Not Listening'}
        <br />
        <span className="text-orange-400">{transcript}</span>
      </div>

      {session?.inspection?.sections?.map((section) => (
        <SectionDisplay
          key={section.id}
          section={section}
          session={session}
          updateSession={updateSession}
        />
      ))}

      <div className="flex justify-center mt-8">
        <button
          onClick={() => router.push('/inspection/summary')}
          className="bg-green-700 hover:bg-green-800 text-white px-6 py-3 rounded text-lg shadow"
        >
          Finish Inspection
        </button>
      </div>
    </div>
  );
}