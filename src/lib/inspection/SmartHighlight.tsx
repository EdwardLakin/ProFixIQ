// components/inspection/SmartHighlight.tsx

import React from 'react';

interface SmartHighlightProps {
  sectionIndex: number;
  itemIndex: number;
}

export default function SmartHighlight({
  sectionIndex,
  itemIndex,
}: SmartHighlightProps) {
  return (
    <div className="text-xs text-gray-400 mb-1 ml-1">
      Section {sectionIndex + 1} • Item {itemIndex + 1}
    </div>
  );
}