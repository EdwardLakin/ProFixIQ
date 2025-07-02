import { interpretCommand } from './interpretCommand';
import { InspectionSession, QuoteLine } from '@lib/inspection/types';

interface HandleTranscriptParams {
  transcript: string;
  session: InspectionSession;
  updateItem: InspectionSession['updateItem'];
  addQuoteLine: (line: QuoteLine) => void;
}

export function handleTranscript({
  transcript,
  session,
  updateItem,
  addQuoteLine,
}: HandleTranscriptParams): InspectionSession {
  const result = interpretCommand(transcript, session);
  if (!result) return session;

  result.actions.forEach((action) => {
    switch (action.type) {
      case 'updateItem':
        updateItem(action.payload.sectionIndex, action.payload.itemIndex, action.payload.updates);
        break;
      case 'addQuoteLine':
        addQuoteLine(action.payload);
        break;
      default:
        console.warn('Unhandled action type:', action.type);
    }
  });

  return {
    ...session,
    transcript,
  };
}