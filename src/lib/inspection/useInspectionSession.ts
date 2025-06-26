import { useState } from 'react';
import { InspectionTemplate, InspectionSession } from '@lib/inspection/types';

export default function useInspectionSession() {
  const [inspection, setInspection] = useState<InspectionSession | null>(null);
  const [isListening, setIsListening] = useState(false);

  const startSession = (template: InspectionTemplate) => {
    const initialized: InspectionSession = {
      templateName: template.name,
      sections: template.sections.map((section) => ({
        title: section.title,
        items: section.items.map((item) => ({
          name: item,
          status: 'unmarked',
          notes: '',
          photo: null,
        })),
      })),
    };
    setInspection(initialized);
  };

  const updateInspection = (updated: InspectionSession) => {
    setInspection(updated);
  };

  const pauseSession = () => {
    setIsListening(false);
  };

  return {
    inspection,
    updateInspection,
    isListening,
    startSession,
    pauseSession,
  };
}