// src/components/inspection/QuickJumpMenu.tsx
import React from 'react';
import { InspectionSession } from '@lib/inspection/types';

interface QuickJumpMenuProps {
  session: InspectionSession;
  onJump: (sectionIndex: number, itemIndex: number) => void;
}

const QuickJumpMenu: React.FC<QuickJumpMenuProps> = ({ session, onJump }) => {
  return (
    <div className="flex flex-wrap gap-2 p-4 justify-center bg-gray-800 rounded-lg">
      {session.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="text-sm">
          <div className="font-bold text-white mb-1">{section.title}</div>
          <div className="flex flex-wrap gap-1">
            {section.items.map((item, itemIndex) => (
              <button
                key={itemIndex}
                className="bg-gray-700 text-white px-2 py-1 rounded hover:bg-orange-600"
                onClick={() => onJump(sectionIndex, itemIndex)}
              >
                {item.item}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default QuickJumpMenu;