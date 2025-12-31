// features/inspections/app/inspection/templates/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import FleetFormImportCard from "@/features/inspections/components/FleetFormImportCard";

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
  const [, setShopId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // get current user
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id ?? null;
      setUserId(uid);

      // resolve shop_id for this user (if any)
      let resolvedShopId: string | null = null;
      if (uid) {
        const byUser = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("user_id", uid)
          .maybeSingle();

        if (byUser.data?.shop_id) {
          resolvedShopId = byUser.data.shop_id;
        } else {
          const byId = await supabase
            .from("profiles")
            .select("shop_id")
            .eq("id", uid)
            .maybeSingle();
          if (byId.data?.shop_id) {
            resolvedShopId = byId.data.shop_id;
          }
        }
      }
      setShopId(resolvedShopId);

      // "My" templates (optionally scoped to shop)
      const minePromise = uid
        ? (() => {
            let q = supabase
              .from("inspection_templates")
              .select("*")
              .eq("user_id", uid)
              .order("created_at", { ascending: false });
            if (resolvedShopId) {
              q = q.eq("shop_id", resolvedShopId);
            }
            return q;
          })()
        : Promise.resolve({
            data: [] as Template[],
            error: null,
          });

      // Shared/public templates (optionally scoped to shop)
      const sharedPromise = (() => {
        let q = supabase
          .from("inspection_templates")
          .select("*")
          .eq("is_public", true)
          .order("created_at", { ascending: false });
        if (resolvedShopId) {
          q = q.eq("shop_id", resolvedShopId);
        }
        return q;
      })();

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
    const lowerSearch = search.trim().toLowerCase();

    let pool: Template[];
    if (scope === "mine") {
      pool = mine;
    } else if (scope === "shared") {
      pool = shared;
    } else {
      // "all" — merge by id to avoid duplicates if a template is both mine + shared
      const byId = new Map<string, Template>();
      for (const t of [...mine, ...shared]) {
        if (!t.id) continue;
        if (!byId.has(t.id)) {
          byId.set(t.id, t);
        }
      }
      pool = Array.from(byId.values());
    }

    if (!lowerSearch) return pool;

    return pool.filter((t) => {
      const name = (t.template_name ?? "").toLowerCase();
      const desc = (t.description ?? "").toLowerCase();
      const tags = Array.isArray(t.tags) ? t.tags.join(", ").toLowerCase() : "";
      return (
        name.includes(lowerSearch) ||
        desc.includes(lowerSearch) ||
        tags.includes(lowerSearch)
      );
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

  const headerCard =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/70 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  const listCard =
    "rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] " +
    "bg-black/70 shadow-[0_20px_70px_rgba(0,0,0,0.95)] backdrop-blur-xl";

  const pillBase =
    "px-3 py-1 text-[10px] uppercase tracking-[0.16em] rounded-full border " +
    "transition-colors";

  return (
    <div className="px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Copper wash */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]"
        />

        {/* Header + filters */}
        <div
          className={
            headerCard + " relative overflow-hidden px-4 py-4 md:px-6 md:py-5"
          }
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-10 h-24 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.2),transparent_65%)]"
          />

          <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1
                className="text-xl font-bold tracking-[0.22em] text-[rgba(248,113,22,0.9)] md:text-2xl uppercase"
                style={{ fontFamily: "Black Ops One, system-ui, sans-serif" }}
              >
                Inspection Templates
              </h1>
              <p className="mt-1 text-xs text-neutral-300">
                Build, import, and manage inspection templates for your shop and
                fleets.
              </p>
            </div>

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              {/* Scope pills */}
              <div className="flex overflow-hidden rounded-full border border-neutral-700/80 bg-black/60">
                {(["mine", "shared", "all"] as Scope[]).map((s) => {
                  const isActive = scope === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setScope(s)}
                      className={
                        pillBase +
                        " " +
                        (isActive
                          ? "border-[rgba(248,113,22,0.7)] bg-[rgba(15,23,42,0.95)] text-[rgba(248,250,252,0.95)]"
                          : "border-transparent bg-transparent text-neutral-400 hover:bg-zinc-900/80")
                      }
                    >
                      {s === "mine"
                        ? "My Templates"
                        : s === "shared"
                          ? "Shared"
                          : "All"}
                    </button>
                  );
                })}
              </div>

              {/* New template CTA */}
              <Link
                href="/inspections/custom-inspection"
                className="mt-1 inline-flex items-center justify-center rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft,#ea580c),var(--accent-copper,#f97316))] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-black shadow-[0_0_22px_rgba(248,113,22,0.6)] hover:shadow-[0_0_30px_rgba(248,113,22,0.8)] md:mt-0"
              >
                New Template
              </Link>
            </div>
          </div>

          {/* Search */}
          <div className="relative mt-4 flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, description, or tags…"
                className="w-full rounded-xl border border-[color:var(--metal-border-soft,#374151)] bg-black/70 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-[rgba(248,113,22,0.55)]"
              />
            </div>

            <div className="text-[11px] text-neutral-500 md:pl-3">
              <span className="hidden md:inline">Tip:</span>{" "}
              Use fleet imports to match customer forms exactly.
            </div>
          </div>
        </div>

        {/* Fleet import card */}
        <FleetFormImportCard />

        {/* Templates list */}
        <div className={listCard + " px-4 py-4 md:px-6 md:py-5"}>
          {loading ? (
            <div className="rounded-xl border border-neutral-800 bg-black/60 px-4 py-4 text-sm text-neutral-300">
              Loading templates…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-black/60 px-4 py-6 text-center text-sm text-neutral-300">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                No templates found
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Try adjusting your filters or import a fleet form to generate a
                template.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {rows.map((t) => {
                const mineOwned = canEditOrDelete(t);
                const encodedName = encodeURIComponent(
                  t.template_name ?? "Custom Inspection",
                );

                const createdAt = t.created_at
                  ? new Date(t.created_at).toLocaleDateString()
                  : "—";

                const tags = Array.isArray(t.tags) ? t.tags : [];
                const lowerTags = tags.map((tag) => tag.toLowerCase());

                const chips: { label: string; className: string }[] = [];

                if (lowerTags.includes("fleet")) {
                  chips.push({
                    label: "Fleet",
                    className:
                      "border-[rgba(56,189,248,0.55)] bg-[rgba(8,47,73,0.7)] text-sky-100",
                  });
                }

                if (
                  lowerTags.includes("dvir") ||
                  lowerTags.includes("pre-trip") ||
                  lowerTags.includes("pretrip") ||
                  lowerTags.includes("post-trip")
                ) {
                  chips.push({
                    label: "DVIR",
                    className:
                      "border-[rgba(45,212,191,0.6)] bg-[rgba(6,78,59,0.7)] text-emerald-100",
                  });
                }

                if (
                  lowerTags.includes("pm") ||
                  lowerTags.includes("preventive maintenance") ||
                  lowerTags.includes("maintenance")
                ) {
                  chips.push({
                    label: "PM",
                    className:
                      "border-[rgba(196,181,253,0.6)] bg-[rgba(49,46,129,0.7)] text-violet-100",
                  });
                }

                // Fallback "Custom" chip if no special type detected
                if (chips.length === 0) {
                  chips.push({
                    label: "Custom",
                    className:
                      "border-[rgba(148,163,184,0.7)] bg-[rgba(15,23,42,0.85)] text-slate-100",
                  });
                }

                return (
                  <li
                    key={t.id}
                    className="relative overflow-hidden rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.95)]"
                  >
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 -top-10 h-20 bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_70%)]"
                    />

                    <div className="relative flex flex-col gap-2">
                      {/* Title + scope + chips */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-neutral-50">
                            {t.template_name ?? "Untitled Template"}
                          </div>
                          <div className="mt-1 line-clamp-3 text-xs text-neutral-400">
                            {t.description || "No description provided."}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={
                              "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] " +
                              (t.is_public
                                ? "border-[rgba(56,189,248,0.5)] bg-[rgba(8,47,73,0.6)] text-sky-200"
                                : "border-[rgba(148,163,184,0.6)] bg-[rgba(15,23,42,0.8)] text-slate-200")
                            }
                          >
                            {t.is_public ? "Shared" : "Private"}
                          </span>

                          <div className="flex flex-wrap items-center justify-end gap-1">
                            {chips.map((chip) => (
                              <span
                                key={chip.label}
                                className={
                                  "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] " +
                                  chip.className
                                }
                              >
                                {chip.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Tags + meta */}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
                        <span>{createdAt}</span>
                        {tags.length > 0 && (
                          <>
                            <span className="text-neutral-600">•</span>
                            <div className="flex flex-wrap gap-1">
                              {tags.slice(0, 4).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-neutral-700 bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-neutral-300"
                                >
                                  {tag}
                                </span>
                              ))}
                              {tags.length > 4 && (
                                <span className="text-[10px] text-neutral-500">
                                  +{tags.length - 4} more
                                </span>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {/* Use Template / run */}
                          <Link
                            href={`/inspections/run?templateId=${t.id}`}
                            className="
                              rounded-full border border-[color:var(--metal-border-soft,#374151)]
                              bg-black/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em]
                              text-neutral-100 hover:border-[rgba(248,113,22,0.65)] hover:bg-black/80
                            "
                          >
                            Use
                          </Link>

                          {/* Edit -> go to custom draft, pass templateId + template name so header fills */}
                          {mineOwned && (
                            <Link
                              href={`/inspections/custom-draft?templateId=${t.id}&template=${encodedName}`}
                              className="
                                rounded-full border border-[color:var(--metal-border-soft,#374151)]
                                bg-black/70 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em]
                                text-neutral-100 hover:border-[rgba(248,113,22,0.65)] hover:bg-black/80
                              "
                            >
                              Edit
                            </Link>
                          )}
                        </div>

                        {/* Delete */}
                        {mineOwned && (
                          <button
                            onClick={() => handleDelete(t.id)}
                            disabled={deletingId === t.id}
                            className="
                              rounded-full border border-red-700/80 bg-red-900/30
                              px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]
                              text-red-200 hover:bg-red-900/50 disabled:opacity-60
                            "
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
    </div>
  );
}