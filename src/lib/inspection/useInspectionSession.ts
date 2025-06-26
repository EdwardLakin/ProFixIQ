import { useState } from 'react';
import { InspectionSession, InspectionSection } from './types';
import useVoiceInput from '@hooks/useVoiceInput';
import handleInspectionCommand from './handleInspectionCommand';
import dispatchCommand from './dispatchCommand';

export default function useInspectionSession() {
  const [inspection, setInspection] = useState<InspectionSession>({
    sections: [],
    currentSectionIndex: 0,
    started: false,
    completed: false,
  });

  const {
    isListening,
    startListening,
    stopListening,
    session,
  } = useVoiceInput();

  const updateInspection = (updated: InspectionSession) => {
    setInspection(updated);
  };

  const processVoiceCommand = async (text: string) => {
    const command = await dispatchCommand(text);
    if (command) {
      const updated = handleInspectionCommand(inspection, command);
      setInspection(updated);
    }
  };

  return {
    inspection,
    updateInspection,
    isListening,
    startListening,
    stopListening,
    session,
  };
}