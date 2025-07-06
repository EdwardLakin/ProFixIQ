'use client';

import { InspectionItem, InspectionSession } from '@lib/inspection/types';
import { useEffect } from 'react';

interface SmartHighlightProps {
  item: InspectionItem;
  onCommand: (cmd: string) => void;
  interpreter: (transcript: string, session: InspectionSession) => Promise<void>;
}

export default function SmartHighlight({
  item,
  onCommand,
  interpreter,
}: SmartHighlightProps) {
  useEffect(() => {
    // Example use case: run AI logic when notes are updated (can be expanded)
    if (item.notes && item.notes.includes('check')) {
      interpreter(item.notes, {} as InspectionSession).then((result) => {
        // handle AI response (optional future logic)
      });
    }
  }, [item.notes, interpreter, onCommand]);

  return (
    <div className="text-sm italic text-gray-400 mt-2">
      {item.notes && <>🔍 AI suggestion: {item.notes}</>}
    </div>
  );
}