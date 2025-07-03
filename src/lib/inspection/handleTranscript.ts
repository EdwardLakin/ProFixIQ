import { InspectionSession } from './types';

export async function handleTranscript(
  transcript: string,
  session: InspectionSession
): Promise<InspectionSession | null> {
  try {
    const response = await fetch('/api/ai/interpret', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input: transcript, session }),
    });

    if (!response.ok) {
      console.error('AI API error:', await response.text());
      return null;
    }

    const result = await response.json();

    // Ensure returned result is valid
    if (!result || typeof result !== 'object') {
      console.warn('Invalid AI result:', result);
      return null;
    }

    return result as InspectionSession;
  } catch (error) {
    console.error('Error handling transcript:', error);
    return null;
  }
}