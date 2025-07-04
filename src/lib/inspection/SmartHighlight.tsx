'use client';

import React from 'react';

interface SmartHighlightProps {
  itemName?: string;
  transcript?: string;
}

export default function SmartHighlight({ itemName, transcript }: SmartHighlightProps) {
  if (!itemName || !transcript) return null;

  const lowerTranscript = transcript.toLowerCase();
  const lowerName = itemName.toLowerCase();

  if (!lowerTranscript.includes(lowerName)) return null;

  return (
    <p className="text-green-400 text-sm mt-1 text-center">
      ✅ Voice match: <strong>{itemName}</strong>
    </p>
  );
}