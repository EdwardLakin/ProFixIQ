// File: app/inspection/page.tsx

'use client';

import { useEffect } from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import SectionDisplay from '@components/inspection/SectionDisplay';
import Button from '@components/ui/Button';

export default function InspectionPage() {
  const {
    session,
    transcript,
    isListening,
    isPaused,
    startListening,
    pauseListening,
    resumeListening,
    stopListening,
  } = useInspectionSession();

  useEffect(() => {
    // Auto-start inspection session if desired
  }, []);

  const handleToggleListening = () => {
    if (!isListening) startListening();
    else if (isPaused) resumeListening();
    else pauseListening();
  };

  if (!session) return <div className="text-white p-6">Loading Inspection...</div>;

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-6">
      <h1 className="text-3xl font-black text-center mb-4">Maintenance Inspection</h1>

      <div className="flex justify-center gap-4 mb-4">
        <Button onClick={handleToggleListening} className="bg-orange-500 hover:bg-orange-600">
          {isListening ? (isPaused ? 'Resume Listening' : 'Pause Listening') : 'Start Listening'}
        </Button>
        <Button onClick={stopListening} className="bg-red-600 hover:bg-red-700">
          Stop
        </Button>
      </div>

      {transcript && (
        <div className="text-center text-orange-300 italic mb-4">
          <strong>Heard:</strong> {transcript}
        </div>
      )}

      {session.sections.map((section, sectionIndex) => (
        <div key={section.title} className="mb-10">
          <h2 className="text-2xl font-bold mb-2 border-b border-gray-600 pb-1">{section.title}</h2>
          <SectionDisplay section={section} sectionIndex={sectionIndex} />
        </div>
      ))}

      <div className="flex justify-center mt-8">
        <Button
          onClick={() => window.location.href = '/inspection/review'}
          className="text-white bg-green-600 hover:bg-green-700"
        >
          Finish Inspection
        </Button>
      </div>
    </div>
  );
}