// src/components/inspection/SmartHighlight.tsx
import React from 'react';
import { InspectionItem } from '@lib/inspection/types';

interface SmartHighlightProps {
  item: InspectionItem;
  index: number;
  highlightedIndex: number;
}

const SmartHighlight: React.FC<SmartHighlightProps> = ({ item, index, highlightedIndex }) => {
  const isHighlighted = index === highlightedIndex;

  return (
    <div
      className={`p-2 text-sm rounded-md ${
        isHighlighted ? 'bg-blue-700 text-white shadow-md' : 'text-gray-300'
      }`}
    >
      {item.item}
    </div>
  );
};

export default SmartHighlight;