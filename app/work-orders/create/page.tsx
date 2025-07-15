'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import { insertPrioritizedJobs } from '../insertPrioritizedJobs';

type JobInput = {
  complaint: string;
  job_type: 'diagnosis' | 'inspection-fail' | 'maintenance' | 'repair';
  cause?: string;
};

export default function CreateWorkOrderPage() {
  const searchParams = useSearchParams();
  const template = searchParams.get('template');
  const pageFrom = searchParams.get('pageFrom');

  const router = useRouter();

  const [workOrderId, setWorkOrderId] = useState<string>('');
  const [vehicleId, setVehicleId] = useState<string>(''); // Set this via input or link
  const [jobs, setJobs] = useState<JobInput[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = uuidv4();
    setWorkOrderId(id);

    if (template && pageFrom === 'inspection') {
      localStorage.setItem('selectedInspectionTemplate', template);
    }
  }, [template, pageFrom]);

  const addJob = () => {
    setJobs((prev) => [...prev, { complaint: '', job_type: 'repair' }]);
  };

  const updateJob = (index: number, key: keyof JobInput, value: any) => {
    const newJobs = [...jobs];
    newJobs[index][key] = value;
    setJobs(newJobs);
  };

  const handleSubmit = async () => {
    if (!vehicleId || !workOrderId || jobs.length === 0) return;

    setLoading(true);

    const { error } = await insertPrioritizedJobs(workOrderId, vehicleId, jobs);

    if (error) {
      console.error('Failed to insert jobs:', error);
    } else {
      router.push(`/work-orders/${workOrderId}`);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <PreviousPageButton to="/inspection" />
      <h1 className="text-3xl font-black text-center mb-4">Create Work Order</h1>
      <p className="text-center text-sm text-gray-400 mb-8">
        {template ? `Linked to template: ${template}` : 'No inspection linked'}
      </p>

      <div className="space-y-4">
        {jobs.map((job, index) => (
          <div key={index} className="bg-gray-800 p-4 rounded shadow space-y-2">
            <div>
              <label className="block text-sm">Complaint</label>
              <input
                type="text"
                value={job.complaint}
                onChange={(e) => updateJob(index, 'complaint', e.target.value)}
                className="w-full px-3 py-1 rounded bg-gray-900 text-white"
              />
            </div>
            <div>
              <label className="block text-sm">Job Type</label>
              <select
                value={job.job_type}
                onChange={(e) =>
                  updateJob(index, 'job_type', e.target.value as JobInput['job_type'])
                }
                className="w-full px-3 py-1 rounded bg-gray-900 text-white"
              >
                <option value="diagnosis">Diagnosis</option>
                <option value="inspection-fail">Inspection Fail</option>
                <option value="maintenance">Maintenance</option>
                <option value="repair">Repair</option>
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center mt-6">
        <button
          onClick={addJob}
          className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded font-semibold"
        >
          + Add Job
        </button>
      </div>

      <div className="text-sm text-center text-orange-400 mt-12">
        Work Order ID: {workOrderId}
      </div>

      <div className="flex justify-center mt-4">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-green-600 hover:bg-green-700 px-6 py-2 rounded text-white font-bold"
        >
          {loading ? 'Creating...' : 'Create Work Order'}
        </button>
      </div>
    </div>
  );
}