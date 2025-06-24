'use client';

import { useEffect, useState } from 'react';
import { initialInspectionState, updateInspectionItem } from '@/lib/inspection/inspectionState';
import useVoiceInput from '@/lib/inspection/useVoiceInput';
import interpretInspectionVoice from '@/lib/inspection/aiInterpreter';

export default function InspectionPage() {
  const [state, setState] = useState(initialInspectionState());
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);

  const handleCommand = async (command: string) => {
    const interpreted = await interpretInspectionVoice(command);
    if (interpreted.section && interpreted.item) {
      setState(prev => updateInspectionItem(prev, interpreted.section, interpreted.item, {
        status: interpreted.type === 'na' || interpreted.type === 'n/a'
          ? 'n/a'
          : interpreted.type === 'recommend'
          ? 'recommended'
          : interpreted.type,
        notes: interpreted.note ? [interpreted.note] : [],
        measurement: interpreted.value
          ? { value: interpreted.value, unit: interpreted.unit || '' }
          : undefined,
      }));
    }
  };

  const { start, stop } = useVoiceInput(handleCommand, setListening);

  const handleStatusChange = (section: string, item: string, status: string) => {
    setState(prev => updateInspectionItem(prev, section, item, { status }));
  };

  const handleNoteChange = (section: string, item: string, note: string) => {
    setState(prev => updateInspectionItem(prev, section, item, { notes: [note] }));
  };

  const handleSubmit = () => {
    if (!input.trim()) return;
    handleCommand(input.trim());
    setInput('');
  };

  return (
    <div className="p-6 text-white">
      <h1 className="text-3xl font-black mb-4">Inspection</h1>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={start}
          className="px-4 py-2 bg-green-600 rounded font-bold"
        >
          Start Inspection
        </button>
        <button
          onClick={stop}
          className="px-4 py-2 bg-red-600 rounded font-bold"
        >
          Pause
        </button>
      </div>

      <div className="mb-6">
        <input
          className="w-full p-2 text-black rounded"
          placeholder="Type inspection input..."
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button
          onClick={handleSubmit}
          className="mt-2 px-4 py-2 bg-blue-600 rounded font-bold"
        >
          Submit
        </button>
      </div>

      {Object.entries(state.sections).map(([section, items]) => (
        <div key={section} className="mb-6">
          <h2 className="text-2xl font-bold mb-2">{section}</h2>
          <ul>
            {Object.entries(items).map(([item, result]) => (
              <li key={item} className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium">{item}</span>
                  <div className="flex gap-2">
                    {['ok', 'fail', 'n/a'].map(status => (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(section, item, status)}
                        className={`px-3 py-1 rounded font-bold border transition ${
                          result.status === status
                            ? 'bg-orange-500 text-white'
                            : 'bg-transparent border-gray-400 text-gray-300'
                        }`}
                      >
                        {status.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  className="mt-1 w-full text-black p-1 rounded"
                  placeholder="Add notes..."
                  value={result.notes?.[0] || ''}
                  onChange={e => handleNoteChange(section, item, e.target.value)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}