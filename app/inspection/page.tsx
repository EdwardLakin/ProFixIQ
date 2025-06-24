'use client';

import { useState } from 'react';
import { dispatchCommand } from '@/lib/inspection/dispatchCommand';
import { generateInspectionSummary } from '@/lib/inspection/summary';
import { createMaintenance50PointInspection } from '@/lib/inspection/templates/maintenance50Point';
import type { InspectionState } from '@/lib/inspection/types';
import useVoiceInput from '@/lib/inspection/useVoiceInput';
import { interpretInspectionVoice } from '@/lib/inspection/aiInterpreter';

export default function InspectionPage() {
  const [inspectionStarted, setInspectionStarted] = useState(false);
  const [state, setState] = useState<InspectionState | null>(null);
  const [input, setInput] = useState('');
  const [summary, setSummary] = useState<string | null>(null);

  const handleVoiceCommand = async (text: string) => {
    if (!state || !text.trim()) return;

    try {
      const interpreted = await interpretInspectionVoice(text);
      const updated = await dispatchCommand(text, state);
      setState(updated);
      setSummary(null);

      // Log suggested repair for now
      if (interpreted.repairLine || interpreted.partSuggestion) {
        console.log('🛠️ Suggested Repair:', interpreted.repairLine);
        console.log('🔧 Part:', interpreted.partSuggestion);
        console.log('⏱️ Labor:', interpreted.laborHours);
      }
    } catch (err) {
      console.error('Voice interpretation failed:', err);
    }
  };

  const { listening, start, stop } = useVoiceInput(handleVoiceCommand);

  const handleStart = () => {
    setState(createMaintenance50PointInspection());
    setInspectionStarted(true);
    setSummary(null);
    setInput('');
  };

  const handleSubmit = async () => {
    if (!input.trim() || !state) return;
    const updated = await dispatchCommand(input, state);
    setState(updated);
    setInput('');
    setSummary(null);
  };

  const handleFinish = () => {
    if (!state) return;

    const updatedState = { ...state };

    for (const [section, items] of Object.entries(updatedState.sections)) {
      for (const [item, result] of Object.entries(items)) {
        if (!(result.status as string)) {
          result.status = 'ok';
        }
      }
    }

    setState(updatedState);
    setSummary(generateInspectionSummary(updatedState));
  };

  return (
    <div className="min-h-screen bg-black text-white font-blackopsone px-4 py-6">
      <div className="max-w-4xl mx-auto bg-white/5 backdrop-blur-md rounded-xl p-6 shadow-md border border-white/10">
        <h1 className="text-3xl mb-6 text-center tracking-wide">Maintenance Inspection</h1>

        {!inspectionStarted ? (
          <div className="text-center">
            <button
              onClick={handleStart}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded font-bold"
            >
              Start Inspection
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row gap-4 mb-4">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Enter inspection command"
                className="flex-1 px-4 py-3 rounded-md bg-white/10 text-white placeholder-white/50 border border-white/20 focus:outline-none"
              />
              <button
                onClick={handleSubmit}
                className="px-6 py-3 rounded-md bg-orange-600 hover:bg-orange-700 transition text-white font-bold"
              >
                Submit
              </button>
            </div>

            <div className="flex justify-between items-center mb-6">
              <button
                onClick={listening ? stop : start}
                className={`px-6 py-3 rounded-md font-bold transition ${
                  listening
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                } text-white`}
              >
                {listening ? '⏹ Stop Listening' : '🎙 Start Listening'}
              </button>

              <button
                onClick={handleFinish}
                className="py-3 px-6 bg-orange-500 hover:bg-orange-600 transition text-white rounded-md font-bold"
              >
                Finish Inspection
              </button>
            </div>

            {state && (
              <>
                <div>
                  <h2 className="text-xl mb-3 border-b border-white/10 pb-1">Inspection Results</h2>
                  {Object.entries(state.sections).map(([section, items]) => (
                    <div key={section} className="mb-4">
                      <h3 className="text-lg font-semibold mb-1 text-orange-400">{section}</h3>
                      <ul className="pl-5 space-y-1 list-disc text-sm">
                        {Object.entries(items).map(([item, result]) => (
                          <li key={item}>
                            <strong>{item}:</strong>{' '}
                            <span className="capitalize">{result.status}</span>
                            {result.notes?.length && (
                              <span> — {result.notes.join('; ')}</span>
                            )}
                            {result.measurement && (
                              <span>
                                {' '}
                                — {result.measurement.value} {result.measurement.unit}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {summary && (
                  <div className="mt-6 p-4 bg-white/10 border border-white/20 rounded-lg">
                    <h2 className="text-xl font-semibold mb-2 text-orange-400">Inspection Summary</h2>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{summary}</p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}