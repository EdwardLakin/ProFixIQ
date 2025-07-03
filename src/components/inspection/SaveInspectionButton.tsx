'use client';

import useInspectionSession from '@lib/inspection/useInspectionSession';
import { saveInspectionSession } from '@lib/inspection/save';

export function SaveInspectionButton() {
  const { session } = useInspectionSession();

  const handleSave = async () => {
    await saveInspectionSession(session);
    alert('Inspection saved');
  };

  return (
    <button
      onClick={handleSave}
      className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded"
    >
      Save Progress
    </button>
  );
}