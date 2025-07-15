'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Database } from '@/types/supabase';
import supabase from '@lib/supabaseClient';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import { format, formatDistance } from 'date-fns';
import { parseWorkOrderCommand } from '@lib/work-orders/commandProcessor';
import { handleWorkOrderCommand } from '@lib/work-orders/handleWorkOrderCommand';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import PauseResumeButton from '@lib/inspection/PauseResume';
import useVoiceInput from '@hooks/useVoiceInput';
import DtcSuggestionPopup from '@components/workorders/DtcSuggestionPopup';

type WorkOrderLine = Database['public']['Tables']['work_order_lines']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

const statusBadge = {
  awaiting: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-orange-100 text-orange-800',
  on_hold: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
};

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tech, setTech] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCommand, setLastCommand] = useState<string | null>(null);

  const {
    isListening,
    setIsListening,
    transcript,
    setTranscript,
    session,
  } = useVoiceInput();

  const fetchData = useCallback(async () => {
    if (!id || typeof id !== 'string') return;

    setLoading(true);

    const { data, error } = await supabase
      .from('work_order_lines')
      .select('*')
      .eq('id', id)
      .single();

    if (error) console.error('Failed to fetch work order:', error);

    if (data) {
      setLine(data);

      if (data.vehicle_id) {
        const { data: vehicleData } = await supabase
          .from('vehicles')
          .select('*')
          .eq('id', data.vehicle_id)
          .single();
        if (vehicleData) setVehicle(vehicleData);
      }

      if (data.assigned_to) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.assigned_to)
          .single();
        if (profileData) setTech(profileData);
      }
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (transcript && line) {
      const command = parseWorkOrderCommand(transcript);
      setLastCommand(JSON.stringify(command));
      handleWorkOrderCommand(command, line, setLine);
    }
  }, [transcript, line]);

  const getPunchDuration = () => {
    if (line?.punched_in_at && line?.punched_out_at) {
      return formatDistance(new Date(line.punched_out_at), new Date(line.punched_in_at));
    }
    return null;
  };

  return (
    <div className="p-6 space-y-6">
      <PreviousPageButton to="/work-orders/queue" />

      <div className="flex gap-4">
        <StartListeningButton
          isListening={isListening}
          setIsListening={setIsListening}
          onStart={() => {}}
        />
        <PauseResumeButton
          isPaused={!isListening}
          onPause={() => setIsListening(false)}
          onResume={() => setIsListening(true)}
          isListening={isListening}
          setIsListening={setIsListening}
          recognitionInstance={session.current}
          setRecognitionRef={(ref) => (session.current = ref)}
          onTranscript={(text) => setTranscript(text)}
        />
        <button
          className="bg-gray-300 dark:bg-gray-700 px-3 py-2 rounded text-sm font-medium"
          onClick={() => {
            setTranscript('');
            setLastCommand(null);
          }}
        >
          Clear
        </button>
      </div>

      {loading && <div className="p-6">Loading...</div>}
      {!line && !loading && (
        <div className="p-6 text-red-500">Work order not found.</div>
      )}

      {line && (
        <>
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Work Order: {line.id}</h1>
            <span className={`text-sm px-2 py-1 rounded ${statusBadge[line.status as keyof typeof statusBadge]}`}>
              {line.status.replace('_', ' ')}
            </span>
          </div>

          <div className="border rounded p-4 bg-white dark:bg-gray-900 shadow">
            <p><strong>Complaint:</strong> {line.complaint || '—'}</p>
            <p><strong>Assigned To:</strong> {tech?.full_name || 'Unassigned'}</p>
            <p><strong>Punched In:</strong> {line.punched_in_at ? format(new Date(line.punched_in_at), 'PPpp') : '—'}</p>
            <p><strong>Punched Out:</strong> {line.punched_out_at ? format(new Date(line.punched_out_at), 'PPpp') : '—'}</p>
            {getPunchDuration() && (
              <p><strong>Duration:</strong> {getPunchDuration()}</p>
            )}
            <p><strong>Hold Reason:</strong> {line.hold_reason || '—'}</p>
            <p><strong>Created:</strong> {line.created_at ? format(new Date(line.created_at), 'PPpp') : '—'}</p>
          </div>

          <div className="border rounded p-4 bg-white dark:bg-gray-900 shadow mt-4">
            <h2 className="font-semibold mb-2">Vehicle Info</h2>
            {vehicle ? (
              <p>{vehicle.year} {vehicle.make} {vehicle.model}</p>
            ) : (
              <p>Unknown vehicle</p>
            )}
          </div>

          <div className="border rounded p-4 bg-white dark:bg-gray-900 shadow mt-4">
            <h2 className="font-semibold mb-2">Voice Transcript</h2>
            <p className="text-sm text-gray-700 dark:text-gray-300">{transcript || '—'}</p>
            {lastCommand && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Last Command: <code>{lastCommand}</code>
              </p>
            )}
          </div>
          {line?.job_type === 'diagnosis' &&
            line.punched_in_at &&
            !line.cause &&
            !line.correction &&
            !line.labor_time &&
            vehicle && (
              <DtcSuggestionPopup
                jobId={line.id}
                vehicle={{
                  id: vehicle.id,
                  year: vehicle.year,
                  make: vehicle.make,
                  model: vehicle.model,
                }}
              />
            )}
        </>
      )}
    </div>
  );
}