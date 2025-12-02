// features/inspections/app/inspection/templates/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  const [userId, setUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setUserId(uid);

      const minePromise = uid
        ? supabase
            .from("inspection_templates")
            .select("*")
            .eq("user_id", uid)
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
      const tags = Array.isArray(t.tags) ? t.tags.join(", ").toLowerCase() : "";
      return name.includes(q) || desc.includes(q) || tags.includes(q);
    });
  }, [scope, mine, shared, search]);

  const canEditOrDelete = (t: Template) => !!userId && t.user_id === userId;

  async function handleDelete(id: string) {
    if (!userId) return;
    const ok = confirm("Delete this template? This cannot be undone.");
    if (!ok) return;
    try {
      setDeletingId(id);
      const { error } = await supabase
        .from("inspection_templates")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) throw error;

      setMine((prev) => prev.filter((t) => t.id !== id));
      setShared((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Delete failed:", e);
      alert("Failed to delete template.");
    } finally {
      setDeletingId(null);
    }
  }

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
          {rows.map((t) => {
            const mineOwned = canEditOrDelete(t);
            const encodedName = encodeURIComponent(t.template_name ?? "Custom Inspection");
            return (
              <li key={t.id} className="rounded border border-zinc-800 bg-zinc-900 p-4">
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

                  <div className="flex items-center gap-2">
                    {/* Use Template / run */}
                    <Link
                      href={`/inspections/run?templateId=${t.id}`}
                      className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                    >
                      Use
                    </Link>

                    {/* Edit -> go to custom draft, pass templateId + template name so header fills */}
                    {mineOwned && (
                      <Link
                        href={`/inspections/custom-draft?templateId=${t.id}&template=${encodedName}`}
                        className="rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800"
                      >
                        Edit
                      </Link>
                    )}

                    {/* Delete */}
                    {mineOwned && (
                      <button
                        onClick={() => handleDelete(t.id)}
                        disabled={deletingId === t.id}
                        className="rounded border border-red-700 px-2 py-1 text-red-200 hover:bg-red-900/40 disabled:opacity-60"
                        title="Delete template"
                      >
                        {deletingId === t.id ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
