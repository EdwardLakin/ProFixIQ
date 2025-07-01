/// components/inspection/VoiceLegend.tsx
'use client';

import { useState } from 'react';

export default function VoiceLegend() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div className="bg-black/60 text-white p-4 rounded-lg shadow-lg backdrop-blur-md mb-4 max-w-xl mx-auto text-sm">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold text-md">🎙️ Voice Command Guide</h3>
        <button
          className="text-white text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded"
          onClick={() => setVisible(false)}
        >
          Hide
        </button>
      </div>
      <ul className="list-disc list-inside space-y-1">
        <li><strong>Add</strong>: "Add front brake pads worn out"</li>
        <li><strong>Recommend</strong>: "Recommend coolant flush"</li>
        <li><strong>Measurement</strong>: "Front tire tread 3mm"</li>
        <li><strong>N/A</strong>: "Rear brakes N/A"</li>
        <li><strong>Pause</strong>: "Pause inspection"</li>
        <li><strong>Resume</strong>: "Resume inspection"</li>
        <li><strong>Status</strong>: "Front rotors fail"</li>
        <li><strong>Undo</strong>: "Undo last"</li>
      </ul>
    </div>
  );
}