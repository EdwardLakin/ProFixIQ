import type { InspectionState } from './types';

export async function syncInspection(state: InspectionState) {
  try {
    const response = await fetch('/api/inspection/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });

    if (!response.ok) {
      throw new Error(`Failed to sync inspection: ${response.statusText}`);
    }

    const result = await response.json();
    console.log('Inspection synced:', result);
    return result;
  } catch (error) {
    console.error('Sync error:', error);
    return null;
  }
}