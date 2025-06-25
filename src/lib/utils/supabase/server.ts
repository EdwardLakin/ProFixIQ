import type { NextApiRequest, NextApiResponse } from 'next';
import type { InspectionState } from '@lib/inspection/types';

let serverState: InspectionState | null = null;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    serverState = req.body as InspectionState;
    return res.status(200).json({ message: 'Inspection state saved' });
  }

  if (req.method === 'GET') {
    if (serverState) {
      return res.status(200).json(serverState);
    } else {
      return res.status(404).json({ message: 'No inspection state found' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}