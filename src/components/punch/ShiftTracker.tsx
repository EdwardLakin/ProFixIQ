'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import { formatDistanceToNow } from 'date-fns';

const supabase = createClientComponentClient<Database>();

export default function ShiftTracker({ userId }: { userId: string }) {
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [status, setStatus] = useState<'none' | 'active' | 'break' | 'lunch' | 'ended'>('none');
  const [duration, setDuration] = useState<string>('00:00');

  useEffect(() => {
    const fetchShift = async () => {
      const { data } = await supabase
        .from('tech_shifts')
        .select('*')
        .eq('tech_id', userId)
        .eq('status', 'active')
        .single();

      if (data) {
        setShiftId(data.id);
        setStartTime(data.start_time);
        setStatus('active');
      } else {
        setStatus('none');
      }
    };

    fetchShift();
  }, [userId]);

  useEffect(() => {
    if (!startTime) return;
    const interval = setInterval(() => {
      setDuration(formatDistanceToNow(new Date(startTime), { includeSeconds: true }));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const insertPunch = async (type: 'start' | 'break_start' | 'break_end' | 'lunch_start' | 'lunch_end' | 'end') => {
    if (!shiftId) return;
    await supabase.from('punch_events').insert({
      shift_id: shiftId,
      tech_id: userId,
      type,
      timestamp: new Date().toISOString(),
    });
  };

  const startShift = async () => {
    const { data } = await supabase
      .from('tech_shifts')
      .insert({
        tech_id: userId,
        start_time: new Date().toISOString(),
        status: 'active',
      })
      .select()
      .single();

    if (data) {
      setShiftId(data.id);
      setStartTime(data.start_time);
      setStatus('active');
      await insertPunch('start');
    }
  };

  const endShift = async () => {
    if (!shiftId) return;
    await supabase
      .from('tech_shifts')
      .update({ end_time: new Date().toISOString(), status: 'ended' })
      .eq('id', shiftId);
    await insertPunch('end');
    setShiftId(null);
    setStatus('ended');
  };

  const handleBreak = async () => {
    if (status === 'break') {
      await insertPunch('break_end');
      setStatus('active');
    } else {
      await insertPunch('break_start');
      setStatus('break');
    }
  };

  const handleLunch = async () => {
    if (status === 'lunch') {
      await insertPunch('lunch_end');
      setStatus('active');
    } else {
      await insertPunch('lunch_start');
      setStatus('lunch');
    }
  };

  return (
    <div className="text-sm mt-4 space-y-2">
      <p><strong>Status:</strong> {status}</p>
      {status === 'active' && startTime && (
        <p><strong>Shift Duration:</strong> {duration}</p>
      )}
      {status === 'none' && (
        <button
          className="bg-green-600 text-white px-4 py-2 rounded"
          onClick={startShift}
        >
          Start Shift
        </button>
      )}
      {status !== 'none' && status !== 'ended' && (
        <div className="space-x-2">
          <button
            className="bg-yellow-500 text-white px-4 py-2 rounded"
            onClick={handleBreak}
          >
            {status === 'break' ? 'End Break' : 'Break'}
          </button>
          <button
            className="bg-orange-500 text-white px-4 py-2 rounded"
            onClick={handleLunch}
          >
            {status === 'lunch' ? 'End Lunch' : 'Lunch'}
          </button>
          <button
            className="bg-red-600 text-white px-4 py-2 rounded"
            onClick={endShift}
          >
            End Shift
          </button>
        </div>
      )}
    </div>
  );
}