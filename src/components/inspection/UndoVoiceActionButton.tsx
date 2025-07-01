// components/inspection/UndoVoiceActionButton.tsx

import { useState } from 'react';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/outline';

interface UndoVoiceActionButtonProps {
  onUndo: () => void;
}

const UndoVoiceActionButton: React.FC<UndoVoiceActionButtonProps> = ({ onUndo }) => {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <button
      className="fixed bottom-24 right-4 z-50 bg-orange-500 text-white p-2 rounded-full shadow-md hover:bg-orange-600"
      onClick={() => {
        onUndo();
        setVisible(false);
        setTimeout(() => setVisible(true), 2000); // prevent spam
      }}
      title="Undo Last Voice Action"
    >
      <ArrowUturnLeftIcon className="h-6 w-6" />
    </button>
  );
};

export default UndoVoiceActionButton;