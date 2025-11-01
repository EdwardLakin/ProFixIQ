// features/inspections/app/inspection/templates/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Template = DB["public"]["Tables"]["inspection_templates"]["Row"];

type Scope = "mine" | "shared" | "all";

export default function InspectionTemplatesPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [scope, setScope] = useState<Scope>("mine");
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState<Template[]>([]);
  const [shared, setShared] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const minePromise = user
        ? supabase
            .from("inspection_templates")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as Template[], error: null });

      const sharedPromise = supabase
        .from("inspection_templates")
        .select("*")
        .eq("is_public", true)
        .order("created_at", { ascending: false });

      const [{ data: mineRaw }, { data: sharedRaw }] = await Promise.all([
        minePromise,
        sharedPromise,
      ]);

      setMine(Array.isArray(mineRaw) ? mineRaw : []);
      setShared(Array.isArray(sharedRaw) ? sharedRaw : []);
      setLoading(false);
    })();
  }, [supabase]);

  const rows = useMemo<Template[]>(() => {
    const pool =
      scope === "mine" ? mine : scope === "shared" ? shared : [...mine, ...shared];

    if (!search.trim()) return pool;

    const q = search.toLowerCase();
    return pool.filter((t) => {
      const name = (t.template_name ?? "").toLowerCase();
      const desc = (t.description ?? "").toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }, [scope, mine, shared, search]);

  return (
    <div className="mx-auto max-w-5xl p-4 text-white">
      <h1 className="mb-4 text-2xl font-bold">Inspection Templates</h1>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded border border-zinc-700">
          {(["mine", "shared", "all"] as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={
                "px-3 py-1 text-sm " +
                (scope === s ? "bg-orange-600" : "bg-zinc-800 hover:bg-zinc-700")
              }
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates…"
          className="min-w-[220px] flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-500"
        />
      </div>

      {loading ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-4">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-6 text-center text-zinc-400">
          No templates found.
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {rows.map((t) => (
            <li
              key={t.id}
              className="rounded border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="mb-1 text-lg font-semibold text-orange-400">
                {t.template_name ?? "Untitled Template"}
              </div>
              <div className="mb-3 line-clamp-3 text-sm text-zinc-300">
                {t.description || "—"}
              </div>
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>
                  {t.is_public ? "Shared" : "Private"} ·{" "}
                  {new Date(t.created_at ?? Date.now()).toLocaleDateString()}
                </span>

                {/* UPDATED: go through the run loader */}
                <a
                  href={`/inspection/run?templateId=${t.id}`}
                  className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                >
                  Use Template
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}