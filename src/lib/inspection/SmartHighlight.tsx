'use client';

import { InspectionItem, InspectionSession } from '@lib/inspection/types';
import { useEffect } from 'react';

interface SmartHighlightProps {
  item: InspectionItem;
  onCommand: (cmd: string) => void;
  interpreter: (transcript: string, session: InspectionSession) => Promise<void>;
  session: InspectionSession;
}

export default function SmartHighlight({
  item,
  onCommand,
  interpreter,
  session,
}: SmartHighlightProps) {
  useEffect(() => {
    if (
      item &&
      typeof item.notes === 'string' &&
      item.notes.includes('check')
    ) {
      interpreter(item.notes, session).then((result) => {
        // Optional future logic
      });
    }
  }, [item?.notes, interpreter, onCommand]);

  return (
    <div className="text-sm italic text-gray-400 mt-2">
      {item?.notes && <>🧠 AI suggestion: {item.notes}</>}
    </div>
  );
}