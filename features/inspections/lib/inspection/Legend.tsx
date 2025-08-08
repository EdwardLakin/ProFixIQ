// components/inspection/Legend.tsx

import { useState } from "react";

const voiceCommands = [
  '"Add front brakes"',
  '"Recommend brake fluid flush"',
  '"Measurement: tire tread 3mm"',
  '"Mark coolant N/A"',
  '"Pause inspection"',
  '"Resume inspection"',
];

const Legend = () => {
  const [showCommands, setShowCommands] = useState(true);

  return (
    <div className="bg-gray-800 bg-opacity-60 p-4 rounded-lg shadow-md text-sm text-white mt-4">
      <div className="flex flex-wrap gap-4 items-center">
        <span className="flex items-center gap-1">
          <span className="text-green-400 text-lg">✅</span> OK
        </span>
        <span className="flex items-center gap-1">
          <span className="text-red-400 text-lg">❌</span> Fail
        </span>
        <span className="flex items-center gap-1">
          <span className="text-yellow-400 text-lg">⚠️</span> Recommend
        </span>
        <span className="flex items-center gap-1">
          <span className="text-orange-400 text-lg">⛔</span> N/A
        </span>
        <button
          onClick={() => setShowCommands(!showCommands)}
          className="ml-auto text-blue-400 underline text-xs"
        >
          {showCommands ? "Hide Voice Commands" : "Show Voice Commands"}
        </button>
      </div>

      {showCommands && (
        <div className="mt-2 text-xs text-gray-300">
          <div className="font-semibold mb-1">Voice Commands:</div>
          <ul className="list-disc pl-5 space-y-1">
            {voiceCommands.map((cmd, idx) => (
              <li key={idx}>{cmd}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default Legend;
