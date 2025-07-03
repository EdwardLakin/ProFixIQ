import { interpretCommand }from '@components/inspection/interpretCommand';
import { InspectionSession, QuoteLine } from '@lib/inspection/types';

interface HandleTranscriptParams {
  transcript: string;
  session: InspectionSession;
  updateItem: InspectionSession['updateItem'];
  addQuoteLine: (line: QuoteLine) => void;
}

export async function handleTranscript({
  transcript,
  session,
  updateItem,
  addQuoteLine,
}: HandleTranscriptParams): Promise<InspectionSession> {
  const result = await interpretCommand(transcript, session);
  if (!result) return session;

  result.actions.forEach((action: any) => {
    switch (action.type) {
      case 'updateItem':
        updateItem(
          action.payload.sectionIndex,
          action.payload.itemIndex,
          action.payload.updated
        );
        break;
      case 'addQuoteLine':
        addQuoteLine(action.payload);
        break;
    }
  });

  return result.session;
}