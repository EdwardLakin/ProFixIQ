import type { NextApiRequest, NextApiResponse } from 'next';
import { insertPrioritizedJobsFromInspection } from '@lib/work-orders/insertPrioritizedJobsFromInspection';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { inspectionId, workOrderId, vehicleId } = req.body;

  if (!inspectionId || !workOrderId || !vehicleId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await insertPrioritizedJobsFromInspection(inspectionId, workOrderId, vehicleId);
    return res.status(200).json({ message: 'Jobs added to work order successfully' });
  } catch (error) {
    console.error('Insert failed:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}