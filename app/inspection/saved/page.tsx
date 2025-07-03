'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@custom-types/supabase';
import { format } from 'date-fns';

import PreviousPageButton from '@components/ui/PreviousPageButton';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SavedInspectionsPage() {
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchInspections = async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching inspections:', error);
      } else {
        setInspections(data || []);
      }

      setLoading(false);
    };

    fetchInspections();
  }, []);

  const handleClick = (id: string) => {
    router.push(`/inspection/${id}`);
  };

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <PreviousPageButton to ="/inspection" />
      <h1 className="text-3xl text-orange-400 font-blackops mb-6 text-center">
        Saved Inspections
      </h1>

      {loading ? (
        <p className="text-center text-white/70">Loading inspections...</p>
      ) : inspections.length === 0 ? (
        <p className="text-center text-white/70">No saved inspections found.</p>
      ) : (
        <div className="space-y-4">
          {inspections.map((insp) => (
            <div
              key={insp.id}
              onClick={() => handleClick(insp.id)}
              className="p-4 bg-white/10 rounded-md hover:bg-white/20 cursor-pointer transition"
            >
              <h2 className="text-lg font-bold text-orange-300">
                {insp.template_name || 'Unnamed Inspection'}
              </h2>
              <p className="text-sm text-white/80">
                Created: {format(new Date(insp.created_at), 'PPpp')}
              </p>
              {insp.vehicle_id && (
                <p className="text-sm text-white/70">Vehicle: {insp.vehicle_id}</p>
              )}
              {insp.customer_id && (
                <p className="text-sm text-white/70">Customer: {insp.customer_id}</p>
              )}
              <p className="text-sm text-white/70 capitalize">
                Status: {insp.status || 'in_progress'}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}