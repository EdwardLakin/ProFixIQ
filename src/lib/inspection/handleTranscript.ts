import { interpretInspectionVoice } from './aiInterpreter';
import { InspectionSession } from './types';

export async function handleTranscript(
  transcript: string,
  session: InspectionSession,
  updateInspection: (updated: InspectionSession) => void
): Promise<void> {
  if (!transcript.trim()) return;

  try {
    const result = await interpretInspectionVoice(transcript, session);

    if (result) {
      updateInspection(result);
    } else {
      console.warn('AI did not return a valid session update.');
    }
  } catch (err) {
    console.error('Failed to handle transcript:', err);
  }
}