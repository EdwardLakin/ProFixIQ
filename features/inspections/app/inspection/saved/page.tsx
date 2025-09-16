"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

type DB = Database;
type InspectionRow = DB["public"]["Tables"]["inspections"]["Row"];

export default function SavedInspectionsPage() {
  const supabase = createClientComponentClient<DB>();
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInspections = async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching inspections:", error);
      } else {
        setInspections(data ?? []);
      }
      setLoading(false);
    };
    fetchInspections();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <PreviousPageButton to="/inspection" />
      <h1 className="mb-6 text-center font-blackops text-3xl text-orange-400">
        Saved Inspections
      </h1>

      {loading ? (
        <p className="text-center text-white/70">Loading inspections…</p>
      ) : inspections.length === 0 ? (
        <p className="text-center text-white/70">No saved inspections found.</p>
      ) : (
        <div className="space-y-4">
          {inspections.map((insp) => {
            const title =
              (insp as { summary?: string | null }).summary ??
              `Inspection ${insp.id.slice(0, 8)}`;

            const created =
              insp.created_at ? format(new Date(insp.created_at), "PPpp") : "—";

            const status =
              (insp as { completed?: boolean | null }).completed === true
                ? "completed"
                : "in_progress";

            return (
              <a
                key={insp.id}
                href={`/inspection/${insp.id}`}
                className="block w-full cursor-pointer rounded-md bg-white/10 p-4 text-left transition hover:bg-white/20"
              >
                <h2 className="text-lg font-bold text-orange-300">{title}</h2>
                <p className="text-sm text-white/80">Created: {created}</p>
                <p className="text-sm capitalize text-white/70">Status: {status}</p>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}