'use client';

import { Dialog } from '@headlessui/react';
import { useState } from 'react';
import supabase from '@lib/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleId: string;
  techId: string;
  onJobAdded?: () => void;
}

export default function AddJobModal({
  isOpen,
  onClose,
  workOrderId,
  vehicleId,
  techId,
  onJobAdded,
}: Props) {
  const [jobName, setJobName] = useState('');
  const [notes, setNotes] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'medium' | 'high'>('medium');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!jobName) return alert('Job name is required.');

    setSubmitting(true);
    const { error } = await supabase.from('work_order_lines').insert({
      id: uuidv4(),
      work_order_id: workOrderId,
      vehicle_id: vehicleId,
      complaint: jobName,
      hold_reason: notes,
      status: 'queued',
      job_type: 'tech-suggested',
      assigned_to: techId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    setSubmitting(false);

    if (error) {
      alert('Failed to add job: ' + error.message);
    } else {
      if (onJobAdded) onJobAdded();
      onClose();
      setJobName('');
      setNotes('');
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md bg-white dark:bg-gray-900 rounded p-6">
          <Dialog.Title className="text-lg font-semibold mb-2">Suggest New Job</Dialog.Title>
          <input
            type="text"
            className="w-full mb-3 p-2 rounded bg-neutral-100 dark:bg-neutral-800"
            placeholder="Job name (e.g. Replace serpentine belt)"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />
          <select
            className="w-full mb-3 p-2 rounded bg-neutral-100 dark:bg-neutral-800"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as 'low' | 'medium' | 'high')}
          >
            <option value="low">Low Urgency</option>
            <option value="medium">Medium Urgency</option>
            <option value="high">High Urgency</option>
          </select>
          <textarea
            rows={3}
            className="w-full mb-3 p-2 rounded bg-neutral-100 dark:bg-neutral-800"
            placeholder="Optional notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button
              className="bg-gray-500 text-white px-4 py-2 rounded"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? 'Adding...' : 'Add Job'}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}