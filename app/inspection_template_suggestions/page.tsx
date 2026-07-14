"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type InspectionSuggestion = DB["public"]["Tables"]["inspection_template_suggestions"]["Row"];

export default function InspectionTemplateSuggestionsPage() {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [rows, setRows] = useState<InspectionSuggestion[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) {
        setError("Sign in required.");
        return;
      }

      const { data: profile } = await supabase.from("profiles").select("shop_id").eq("id", user.id).maybeSingle();
      if (!profile?.shop_id) {
        setError("No shop found for your profile.");
        return;
      }

      const { data, error: loadErr } = await supabase
        .from("inspection_template_suggestions")
        .select("*")
        .eq("shop_id", profile.shop_id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (loadErr) {
        setError(loadErr.message);
        return;
      }
      setRows(data ?? []);
    })();
  }, [supabase]);

  return (
    <div className="min-h-screen bg-[color:var(--theme-surface-page)] p-6 text-[color:var(--theme-text-primary)]">
      <h1 className="text-xl font-semibold text-[color:var(--accent-copper-light,#fdba74)]">Review inspections</h1>
      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">inspection_template_suggestions</p>
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-3 text-sm">
            <p className="font-medium text-[color:var(--theme-text-primary)]">{row.name ?? "Untitled suggestion"}</p>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              Confidence: {typeof row.confidence === "number" ? row.confidence.toFixed(2) : "n/a"}
            </p>
          </div>
        ))}
        {rows.length === 0 && !error ? (
          <p className="text-sm text-[color:var(--theme-text-secondary)]">No inspection suggestions.</p>
        ) : null}
      </div>
    </div>
  );
}
