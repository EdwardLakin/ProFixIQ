'use client';

import { useEffect, useState } from 'react';
import { initialInspectionState, updateInspectionItem } from '@/lib/inspection/inspectionState';
import useVoiceInput from '@/lib/inspection/useVoiceInput';
import { interpretInspectionVoice } from '@/lib/inspection/aiInterpreter';

export default function InspectionPage() {
  const [state, setState] = useState(initialInspectionState());
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);

  const handleCommand = async (command: string) => {
    const interpreted = await interpretInspectionVoice(command);
    if (interpreted.section && interpreted.item) {
      setState(prev =>
        updateInspectionItem(prev, interpreted.section, interpreted.item, {
          status: interpreted.type === 'na' ? 'n/a' : interpreted.type === 'recommend' ? 'recommended' : interpreted.type === 'add' ? 'fail' : 'ok',
          notes: interpreted.note ? [interpreted.note] : [],
          measurement: interpreted.value ? { value: interpreted.value, unit: interpreted.unit || '' } : undefined,
        })
      );
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
    if (input.trim()) {
      handleCommand(input.trim());
      setInput('');
    }
  };

  return (
    <main className="min-h-screen bg-black text-white p-6 font-sans">
      <div className="max-w-4xl mx-auto bg-white/10 border border-white/20 rounded-xl p-6 shadow-xl backdrop-blur">
        <h1 className="text-3xl font-bold font-blackops mb-4 text-center text-orange-400">Maintenance Inspection</h1>

        <div className="flex items-center gap-3 mb-4">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Enter inspection command"
            className="flex-1 rounded bg-black border border-white/20 p-2 text-white placeholder:text-gray-400"
          />
          <button onClick={handleSubmit} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded text-white font-bold">Submit</button>
        </div>

        <div className="flex gap-3 mb-6">
          {!listening ? (
            <button onClick={start} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white font-bold">🎙 Start Inspection</button>
          ) : (
            <button onClick={stop} className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded text-white font-bold">⏸ Pause Inspection</button>
          )}
          <button onClick={() => console.log(state)} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded text-white font-bold">Finish Inspection</button>
        </div>

        <div className="space-y-6">
          {Object.entries(state.sections).map(([section, items]) => (
            <div key={section}>
              <h2 className="text-xl font-bold text-orange-400 mb-2">{section}</h2>
              <ul className="space-y-2">
                {Object.entries(items).map(([item, result]) => (
                  <li key={item} className="bg-white/5 rounded p-3 flex flex-col md:flex-row md:items-center md:justify-between">
                    <div className="font-semibold capitalize">{item}</div>
                    <div className="flex items-center gap-2 mt-2 md:mt-0">
                      {['ok', 'fail', 'n/a'].map(status => (
                        <button
                          key={status}
                          onClick={() => handleStatusChange(section, item, status)}
                          className={`px-2 py-1 rounded text-sm font-semibold ${
                            result.status === status
                              ? 'bg-orange-600 text-white'
                              : 'bg-white/10 hover:bg-white/20 text-white'
                          }`}
                        >
                          {status.toUpperCase()}
                        </button>
                      ))}
                      <input
                        placeholder="Note"
                        className="ml-2 rounded bg-black/30 border border-white/20 px-2 py-1 text-white text-sm"
                        value={result.notes?.[0] || ''}
                        onChange={e => handleNoteChange(section, item, e.target.value)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}