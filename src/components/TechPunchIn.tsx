'use client';

import { useState } from 'react';
import Button from './ui/Button';

export default function TechPunchIn() {
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);

  const handlePunchIn = () => {
    setStartTime(new Date());
    setIsPunchedIn(true);
  };

  const handlePunchOut = () => {
    setStartTime(null);
    setIsPunchedIn(false);
  };

  return (
    <div className="bg-card text-white rounded-lg shadow-card p-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-accent mb-4">🔧 Technician Punch In</h1>

      {isPunchedIn ? (
        <>
          <p className="mb-4">You are currently <span className="text-green-400">punched in</span>.</p>
          <p className="mb-4 text-sm text-muted">Start time: {startTime?.toLocaleTimeString()}</p>
          <Button onClick={handlePunchOut} className="bg-red-600 hover:bg-red-700">Punch Out</Button>
        </>
      ) : (
        <>
          <p className="mb-4">You are currently <span className="text-yellow-400">punched out</span>.</p>
          <Button onClick={handlePunchIn} className="bg-green-600 hover:bg-green-700">Punch In</Button>
        </>
      )}
    </div>
  );
}