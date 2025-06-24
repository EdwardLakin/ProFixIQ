'use client';

import { useEffect, useRef, useState } from 'react';
import { dispatchInspectionCommand } from '@/lib/inspection/dispatchCommand';
import { parseInspectionVoice } from '@/lib/inspection/aiInterpreter';
import { InspectionState, InspectionCommand } from '@/lib/inspection/types';
import { createMaintenance50PointInspection } from '@/lib/inspection/templates/maintenance50Point';

export default function InspectionPage() {
  const [state, setState] = useState<InspectionState>(() =>
    createMaintenance50PointInspection()
  );
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleCommand = async (command: string) => {
    const interpreted = await parseInspectionVoice(command);
    if (interpreted) {
      setState((prev) => dispatchInspectionCommand(prev, interpreted));
    }
  };

  useEffect(() => {
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognition) {
      console.warn('Speech recognition not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')
        .trim();
      if (transcript) handleCommand(transcript);
    };

    recognitionRef.current = recognition;
  }, []);

  const start = () => recognitionRef.current?.start();
  const stop = () => recognitionRef.current?.stop();

  const handleSubmit = () => {
    if (input.trim()) {
      handleCommand(input.trim());
      setInput('');
    }
  };

  const handleStatusChange = (section: string, item: string, status: string) => {
    const command: InspectionCommand = {
      section,
      item,
      type: status as any,
    };
    setState((prev) => dispatchInspectionCommand(prev, command));
  };

  const handleNoteChange = (section: string, item: string, note: string) => {
    const command: InspectionCommand = {
      section,
      item,
      type: 'recommend',
      note,
    };
    setState((prev) => dispatchInspectionCommand(prev, command));
  };

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Inspection</h1>

      {Object.entries(state.sections).map(([section, items]) => (
        <div key={section} className="mb-4">
          <h2 className="text-xl font-semibold mb-2">{section}</h2>
          {Object.entries(items).map(([item, result]) => (
            <div key={item} className="mb-2">
              <div className="flex items-center space-x-4 mb-1">
                <span className="w-48">{item}</span>
                {['ok', 'fail', 'na'].map((status) => (
                  <button
                    key={status}
                    onClick={() => handleStatusChange(section, item, status)}
                    className={`px-3 py-1 rounded ${
                      result.status === status ? 'bg-orange-500' : 'bg-gray-700'
                    }`}
                  >
                    {status.toUpperCase()}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={result.note || ''}
                onChange={(e) => handleNoteChange(section, item, e.target.value)}
                placeholder="Add note..."
                className="w-full p-2 rounded bg-gray-800 text-white mb-2"
              />
            </div>
          ))}
        </div>
      ))}

      <div className="flex gap-2 mb-4">
        <button onClick={start} className="bg-green-600 px-4 py-2 rounded">
          Start Listening
        </button>
        <button onClick={stop} className="bg-red-600 px-4 py-2 rounded">
          Pause
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a command"
          className="flex-1 p-2 rounded bg-gray-800 text-white"
        />
        <button onClick={handleSubmit} className="bg-blue-600 px-4 py-2 rounded">
          Submit
        </button>
      </div>
    </div>
  );
}