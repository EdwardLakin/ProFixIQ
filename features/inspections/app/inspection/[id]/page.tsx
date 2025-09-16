"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@shared/types/types/supabase";
import { format } from "date-fns";
import PreviousPageButton from "@shared/components/ui/PreviousPageButton";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// --- Types ---
interface InspectionItem {
  name: string;
  status?: string;
  notes?: string;
  value?: string;
  unit?: string;
  photoUrls?: string[];
}

interface InspectionResultSection {
  title: string;
  items: InspectionItem[];
}

interface Inspection {
  id: string;
  created_at: string;
  template_name?: string;
  status: string;
  result: InspectionResultSection[];
}

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const fetchInspection = async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        console.error("Error fetching inspection:", error);
        router.push("/inspection/saved");
        return;
      }

      setInspection(data as Inspection);
      setLoading(false);
    };

    if (id) {
      fetchInspection();
    }
  }, [id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white px-4 py-6">
        <p className="text-center text-white/70">Loading inspection...</p>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="min-h-screen bg-black text-white px-4 py-6">
        <p className="text-center text-red-500">Inspection not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <PreviousPageButton to="/inspection/saved" />
      <h1 className="text-3xl text-orange-400 font-blackops mb-4 text-center">
        {inspection.template_name || "Inspection Details"}
      </h1>

      <p className="text-white/80 text-center mb-2">
        Created: {format(new Date(inspection.created_at), "PPpp")}
      </p>
      <p className="text-white/70 text-center mb-6 capitalize">
        Status: {inspection.status}
      </p>

      <div className="space-y-6">
        {inspection.result?.map((section, index) => (
          <div
            key={index}
            className="border border-white/10 p-4 rounded-md bg-white/5"
          >
            <h2 className="text-lg font-bold text-orange-300 mb-2">
              {section.title}
            </h2>
            <ul className="space-y-2">
              {section.items?.map((item, i) => (
                <li key={i} className="text-sm text-white/90">
                  <span className="font-semibold text-white">{item.name}:</span>{" "}
                  {item.status || "N/A"}
                  {item.notes && (
                    <span className="block text-white/60">
                      Note: {item.notes}
                    </span>
                  )}
                  {item.value && (
                    <span className="block text-white/60">
                      {item.unit ? `${item.value} ${item.unit}` : item.value}
                    </span>
                  )}
                  {(item.photoUrls?.length ?? 0) > 0 && (
                    <div className="mt-2 flex gap-2 flex-wrap">
                      {item.photoUrls?.map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt="Photo"
                          className="w-24 h-24 object-cover rounded border border-white/20"
                        />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}