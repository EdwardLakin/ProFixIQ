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
      scope === "mine"
        ? mine
        : scope === "shared"
        ? shared
        : [...mine, ...shared];

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
    <div className="min-h-[calc(100vh-3rem)] bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),#020617_88%)] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-black/40 p-5 shadow-[0_22px_55px_rgba(0,0,0,0.95)] backdrop-blur">
        {/* Header */}
        <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-blackops uppercase tracking-[0.2em] text-orange-400">
              Inspection Templates
            </h1>
            <p className="mt-1 text-xs text-neutral-400">
              Build, share, and run inspection layouts that feed the unified
              inspection runner.
            </p>
          </div>

          {/* Scope + search */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="flex overflow-hidden rounded-full border border-neutral-700 bg-neutral-950/80 shadow-[0_0_22px_rgba(15,23,42,0.9)]">
              {(["mine", "shared", "all"] as Scope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={
                    "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] transition " +
                    (scope === s
                      ? "bg-orange-500 text-black shadow-[0_0_24px_rgba(249,115,22,0.7)]"
                      : "bg-transparent text-neutral-300 hover:bg-neutral-900")
                  }
                >
                  {s}
                </button>
              ))}
            </div>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              className="w-full rounded-full border border-neutral-700 bg-neutral-950/80 px-3 py-2 text-xs text-neutral-100 placeholder:text-neutral-500 shadow-[0_0_22px_rgba(15,23,42,0.9)] focus:outline-none focus:ring-2 focus:ring-orange-500/80 sm:w-56"
            />
          </div>
        </header>

        {loading ? (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-4 text-sm text-neutral-300">
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 text-center text-sm text-neutral-400">
            No templates found yet. Use the custom builder to create your first
            inspection layout.
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {rows.map((t) => {
              const mineOwned = canEditOrDelete(t);
              const encodedName = encodeURIComponent(
                t.template_name ?? "Custom Inspection",
              );

              const created =
                t.created_at ?? new Date().toISOString(); // display fallback only

              return (
                <li
                  key={t.id}
                  className="rounded-2xl border border-neutral-800/90 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.12),rgba(15,23,42,0.98))] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.92)]"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-orange-400">
                        {t.template_name ?? "Untitled Template"}
                      </div>
                      <div className="mt-1 text-[11px] text-neutral-400">
                        {t.is_public ? "Shared library" : "Private"} ·{" "}
                        {new Date(created).toLocaleDateString()}
                      </div>
                    </div>

                    {Array.isArray(t.tags) && t.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {t.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-neutral-900/80 px-2 py-[2px] text-[10px] text-neutral-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mb-3 line-clamp-3 text-xs text-neutral-200">
                    {t.description || "No description provided."}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-neutral-500">
                      {mineOwned ? "Owned by you" : "From shop library"}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Preview Template – unified runner in preview mode */}
                      <Link
                        href={`/inspections/unified/custom-draft?templateId=${t.id}&template=${encodedName}&mode=preview`}
                        className="rounded-full border border-orange-400/80 bg-orange-500 px-3 py-1 text-[11px] font-semibold text-black shadow-[0_0_22px_rgba(249,115,22,0.65)] hover:bg-orange-400"
                      >
                        Preview
                      </Link>

                      {/* Edit Template */}
                      {mineOwned && (
                        <Link
                          href={`/inspections/unified/custom-draft?templateId=${t.id}&template=${encodedName}&mode=edit`}
                          className="rounded-full border border-neutral-600/80 bg-neutral-900 px-3 py-1 text-[11px] font-semibold text-neutral-100 hover:bg-neutral-800"
                        >
                          Edit
                        </Link>
                      )}

                      {/* Delete */}
                      {mineOwned && (
                        <button
                          onClick={() => handleDelete(t.id)}
                          disabled={deletingId === t.id}
                          className="rounded-full border border-red-500/80 bg-red-950/70 px-3 py-1 text-[11px] font-semibold text-red-200 hover:bg-red-900/80 disabled:opacity-60"
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
    </div>
  );
}