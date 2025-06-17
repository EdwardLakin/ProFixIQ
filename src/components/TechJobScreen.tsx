'use client';

import React, { useEffect, useState } from 'react';
import { useUser } from '@/lib/useUser';
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/supabase';
import JobQueueCard from './JobQueueCard';
import Button from './ui/Button';

type JobLine = Database['public']['Tables']['work_order_lines']['Row'];

const supabase = createBrowserClient<Database>();

export default function TechJobScreen() {
  const { user } = useUser();
  const [jobLines, setJobLines] = useState<JobLine[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch jobs assigned to tech or available
  useEffect(() => {
    if (!user) return;

    const fetchJobs = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('work_order_lines')
        .select('*')
        .or(`assigned_to.eq.${user.id},assigned_to.is.null`)
        .in('status', ['ready', 'on_hold', 'active']) // Only current queue
        .order('created_at');

      if (!error && data) {
        setJobLines(data);
      }

      setLoading(false);
    };

    fetchJobs();

    const channel = supabase
      .channel('job-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_lines' }, fetchJobs)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handlePunchIn = async (job: JobLine) => {
    setActiveJobId(job.id);

    await supabase
      .from('work_order_lines')
      .update({ status: 'active', assigned_to: user?.id })
      .eq('id', job.id);
  };

  const handlePunchOut = async (job: JobLine) => {
    setActiveJobId(null);

    await supabase
      .from('work_order_lines')
      .update({ status: 'paused' })
      .eq('id', job.id);
  };

  const renderJobCard = (job: JobLine) => (
    <JobQueueCard
      key={job.id}
      job={job}
      isActive={activeJobId === job.id}
      onPunchIn={handlePunchIn}
      onPunchOut={handlePunchOut}
    />
  );

  const activeJob = jobLines.find(j => j.id === activeJobId);
  const readyJobs = jobLines.filter(j => j.status === 'ready' && j.id !== activeJobId);
  const onHoldJobs = jobLines.filter(j => j.status === 'on_hold');

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-xl font-bold text-accent">Technician Job Queue</h1>

      {loading && <p className="text-sm text-muted">Loading jobs…</p>}

      {activeJob ? (
        <div>
          <h2 className="text-lg font-semibold">Current Job</h2>
          {renderJobCard(activeJob)}
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold">Ready Jobs</h2>
          {readyJobs.length > 0 ? readyJobs.map(renderJobCard) : <p>No available jobs.</p>}
        </div>
      )}

      {onHoldJobs.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold">On Hold</h2>
          {onHoldJobs.map(renderJobCard)}
        </div>
      )}

      <div className="pt-6">
        <Button onClick={() => supabase.auth.signOut()}>Sign Out</Button>
      </div>
    </div>
  );
}