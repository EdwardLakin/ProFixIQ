"use client";

import React from "react";
import useInspectionSession from "@inspections/hooks/useInspectionSession";

const ResumeReminder = () => {
  const { isPaused, resumeSession } = useInspectionSession();

  if (!isPaused) return null;

  return (
    <div className="bg-yellow-900 border border-yellow-500 text-yellow-300 p-3 rounded-md shadow-md mb-4">
      <p className="text-sm mb-2">Inspection paused – tap to resume.</p>
      <button
        onClick={resumeSession}
        className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-1 px-4 rounded"
      >
        Resume
      </button>
    </div>
  );
};

export default ResumeReminder;
