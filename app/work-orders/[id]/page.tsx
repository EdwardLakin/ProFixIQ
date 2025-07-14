'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import type { Database } from '@/types/supabase';
import supabase from '@lib/supabaseClient';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import { format } from 'date-fns';
import { parseWorkOrderCommand } from '@lib/work-orders/commandProcessor';
import { handleWorkOrderCommand } from '@lib/work-orders/handleWorkOrderCommand';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import PauseResumeButton from '@lib/inspection/PauseResume';
import useVoiceInput from '@hooks/useVoiceInput';

type WorkOrderLine = Database['public']['Tables']['work_order_lines']['Row'];
type Vehicle = Database['public']['Tables']['vehicles']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const [line, setLine] = useState<WorkOrderLine | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [tech, setTech] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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

    const { data } = await supabase
      .from('work_order_lines')
      .select('*')
      .eq('id', id)
      .single();

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
      handleWorkOrderCommand(command, line, setLine);
    }
  }, [transcript, line]);

  return (
    <div className="p-6 space-y-4">
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
      </div>

      {loading && <div className="p-6">Loading...</div>}
      {!line && !loading && <div className="p-6 text-red-500">Work order not found.</div>}

      {line && (
        <>
          <h1 className="text-2xl font-semibold">Work Order: {line.id}</h1>
          <div className="border rounded p-4 bg-white shadow">
            <p><strong>Status:</strong> {line.status}</p>
            <p><strong>Complaint:</strong> {line.complaint}</p>
            <p><strong>Assigned To:</strong> {tech?.full_name}</p>
            <p><strong>Punched In:</strong> {line.punched_in_at ? format(new Date(line.punched_in_at), 'PPpp') : '—'}</p>
            <p><strong>Punched Out:</strong> {line.punched_out_at ? format(new Date(line.punched_out_at), 'PPpp') : '—'}</p>
            <p><strong>Hold Reason:</strong> {line.hold_reason}</p>
            <p><strong>Created:</strong> {line.created_at ? format(new Date(line.created_at), 'PPpp') : '—'}</p>
          </div>

          {vehicle && (
            <div className="mt-4">
              <p><strong>Vehicle:</strong> {vehicle.year} {vehicle.make} {vehicle.model}</p>
            </div>
          )}

          <p className="mt-4 text-gray-600">
            <strong>Transcript:</strong> {transcript}
          </p>
        </>
      )}
    </div>
  );
}