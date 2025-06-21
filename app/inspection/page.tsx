// app/inspection/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { createInitialInspectionState, updateInspectionState, summarizeInspection } from '@/lib/inspection/inspectionState';
import { useSpeechToText } from '@/lib/inspection/useSpeechToText';

export default function InspectionPage() {
  const [input, setInput] = useState('');
  const [inspectionState, setInspectionState] = useState(createInitialInspectionState());
  const [summaryMode, setSummaryMode] = useState(false);

  const { transcript, startListening, stopListening, listening } = useSpeechToText();

  useEffect(() => {
    if (transcript) {
      const updated = updateInspectionState(inspectionState, transcript);
      setInspectionState(updated);
    }
  }, [transcript]);

  function handleCommandSubmit() {
    const updated = updateInspectionState(inspectionState, input);
    setInspectionState(updated);
    setInput('');
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-8 font-sans">
      <h1 className="text-4xl md:text-5xl font-black mb-6 text-orange-400 text-center">ProFixIQ Inspection</h1>

      {!summaryMode ? (
        <>
          <div className="mb-4 flex flex-col gap-4">
            <textarea
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a command or inspection note..."
              className="w-full p-4 rounded-lg text-black"
            />

            <button
              onClick={handleCommandSubmit}
              className="bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md font-bold"
            >
              Submit
            </button>

            <button
              onClick={listening ? stopListening : startListening}
              className="bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-md font-bold"
            >
              {listening ? 'Stop Listening' : 'Start Voice Input'}
            </button>

            <button
              onClick={() => setSummaryMode(true)}
              className="bg-gray-800 hover:bg-gray-700 text-white py-2 px-4 rounded-md font-bold"
            >
              Complete Inspection
            </button>
          </div>

          <div className="text-sm">
            <p className="text-gray-400">Live transcript:</p>
            <p className="italic text-green-300">{transcript}</p>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold mb-4 text-yellow-400">Inspection Summary</h2>
          <div className="bg-white text-black p-4 rounded-lg max-h-[60vh] overflow-y-auto text-sm">
            <pre>{JSON.stringify(summarizeInspection(inspectionState), null, 2)}</pre>
          </div>

          <button
            onClick={() => setSummaryMode(false)}
            className="mt-4 bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-md font-bold"
          >
            Back to Inspection
          </button>
        </>
      )}
    </div>
  );
}