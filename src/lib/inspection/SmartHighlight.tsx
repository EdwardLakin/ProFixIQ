'use client';

import React, { useEffect, useState } from 'react';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import PhotoThumbnail from '@components/inspection/PhotoThumbnail';
import { ParsedCommand, InspectionItem, InspectionSession } from '@lib/inspection/types';

interface SmartHighlightProps {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  session: InspectionSession;
  updateItem: (
    sectionIndex: number,
    itemIndex: number,
    updates: Partial<InspectionItem>
  ) => void;
  updateInspection: (updates: Partial<InspectionSession>) => void;
  updateSection: (
    sectionIndex: number,
    updates: Partial<InspectionSession['sections'][0]>
  ) => void;
  finishSession: () => void;
  onCommand: (command: ParsedCommand) => void;
  interpreter: (transcript: string) => Promise<ParsedCommand[]>;
  transcript: string;
}

export default function SmartHighlight({
  item,
  sectionIndex,
  itemIndex,
  session,
  updateItem,
  updateInspection,
  updateSection,
  finishSession,
  onCommand,
  interpreter,
  transcript,
}: SmartHighlightProps) {
  const [commands, setCommands] = useState<ParsedCommand[]>([]);

  useEffect(() => {
    const runInterpreter = async () => {
      if (!transcript) return;
      const cmds = await interpreter(transcript);
      setCommands(cmds);
      cmds.forEach(onCommand);
    };
    runInterpreter();
  }, [transcript]);

  const handlePhotoUpload = (url: string) => {
    const prev = session.sections[sectionIndex].items[itemIndex].photoUrls || [];
    updateItem(sectionIndex, itemIndex, {
      photoUrls: [...prev, url],
    });
  };

  return (
    <div className="text-sm text-white bg-black rounded p-2 space-y-2">
      <div className="font-semibold">Smart Highlight</div>
      <div>Status: {item.status}</div>
      {item.notes && <div>Notes: {item.notes}</div>}
      {item.recommend && item.recommend.length > 0 && (
        <div>Recommend: {item.recommend.join(', ')}</div>
      )}
      {item.photoUrls && item.photoUrls.length > 0 && (
        <div className="flex flex-wrap">
          {item.photoUrls.map((url, idx) => (
            <PhotoThumbnail key={idx} url={url} />
          ))}
        </div>
      )}
      {(item.status === 'fail' || item.status === 'recommend') && (
        <PhotoUploadButton
          sectionIndex={sectionIndex}
          itemIndex={itemIndex}
          photoUrls={item.photoUrls ?? []}
          onUpload={handlePhotoUpload}
        />
      )}
    </div>
  );
}