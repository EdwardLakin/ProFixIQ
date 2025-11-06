export const dynamic = "force-dynamic";
export const revalidate = 0;

import { cookies } from "next/headers";
import Link from "next/link";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WO = DB["public"]["Tables"]["work_orders"]["Row"];

type RollupStatus = "awaiting" | "in_progress" | "on_hold" | "completed";
type Counts = Record<RollupStatus, number>;

function rollupStatus(lines: Line[]): RollupStatus {
  const s = new Set(
    (lines ?? []).map((l) => (l.status ?? "awaiting") as RollupStatus)
  );
  // priority
  if (s.has("in_progress")) return "in_progress";
  if (s.has("on_hold")) return "on_hold";
  if (lines.length && lines.every((l) => (l.status ?? "") === "completed"))
    return "completed";
  return "awaiting";
}

const STATUS_LABELS: Record<RollupStatus, string> = {
  awaiting: "Awaiting",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
};

// slightly different accents so you can tell they’re clickable
const STATUS_STYLES: Record<RollupStatus, string> = {
  awaiting:
    "border-slate-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  in_progress:
    "border-amber-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  on_hold:
    "border-purple-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
  completed:
    "border-emerald-700 bg-neutral-900/80 hover:border-orange-400 data-[active=true]:border-orange-400 data-[active=true]:bg-orange-500/10",
};

export default async function QueuePage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const supabase = createServerComponentClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <div className="p-6 text-white">You must be signed in.</div>;

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.shop_id) {
    return <div className="p-6 text-white">No shop linked to your profile yet.</div>;
  }

  const isTech = profile.role === "tech" || profile.role === "mechanic";

  // last 30 days
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: wos } = await supabase
    .from("work_orders")
    .select("*")
    .eq("shop_id", profile.shop_id)
    .neq("status", "awaiting_approval")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false });

  if (!wos?.length) return <div className="p-6 text-white">No work orders yet.</div>;

  const ids = wos.map((w) => w.id);
  const { data: lines } = ids.length
    ? await supabase.from("work_order_lines").select("*").in("work_order_id", ids)
    : { data: [] as Line[] };

  const linesByWo = new Map<string, Line[]>();
  (lines ?? []).forEach((l) => {
    if (!l.work_order_id) return;
    const arr = linesByWo.get(l.work_order_id) ?? [];
    arr.push(l);
    linesByWo.set(l.work_order_id, arr);
  });

  const visibleWos: WO[] = isTech
    ? wos.filter((wo) => (linesByWo.get(wo.id) ?? []).some((l) => l.assigned_to === user.id))
    : wos;

  const filteredOut: WO[] = isTech
    ? wos.filter((wo) => !visibleWos.some((v) => v.id === wo.id))
    : [];

  // count per rollup
  const counts: Counts = {
    awaiting: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
  };
  for (const wo of visibleWos)
    counts[rollupStatus(linesByWo.get(wo.id) ?? [])] += 1;

  const statuses: RollupStatus[] = [
    "awaiting",
    "in_progress",
    "on_hold",
    "completed",
  ];

  // read current filter from URL
  const selected = (searchParams?.status as RollupStatus | undefined) ?? undefined;
  const selectedIsValid = selected && statuses.includes(selected);
  const activeFilter: RollupStatus | null = selectedIsValid ? selected : null;

  // apply filter to list below
  const filteredWos =
    activeFilter === null
      ? visibleWos
      : visibleWos.filter(
          (wo) => rollupStatus(linesByWo.get(wo.id) ?? []) === activeFilter
        );

  return (
    <div className="p-6 text-white">
      <h1 className="mb-4 text-2xl font-blackops text-orange-400">Job Queue</h1>

      {/* DEBUG */}
      <div className="mb-4 rounded border border-neutral-800 bg-neutral-900 p-3 text-sm">
        <div className="mb-1 font-semibold text-orange-400">Debug</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <div>
              <span className="text-neutral-400">User:</span> {user.id}
            </div>
            <div>
              <span className="text-neutral-400">Role:</span>{" "}
              {profile.role ?? "—"}
            </div>
            <div>
              <span className="text-neutral-400">Shop:</span>{" "}
              {profile.shop_id ?? "—"}
            </div>
          </div>
          <div className="space-y-1">
            <div>
              <span className="text-neutral-400">Fetched WOs (RLS):</span>{" "}
              {wos.length}
            </div>
            <div>
              <span className="text-neutral-400">Fetched Lines:</span>{" "}
              {lines?.length ?? 0}
            </div>
            <div className="text-neutral-400">
              <span>Visible WOs:</span> {visibleWos.length}
              {isTech ? ` (tech filter on)` : ""}
            </div>
            {isTech && (
              <div>
                <span className="text-neutral-400">Filtered Out:</span>{" "}
                {filteredOut.length}
              </div>
            )}
          </div>
        </div>
        {isTech && filteredOut.length > 0 && (
          <div className="mt-2">
            <div className="mb-1 text-neutral-400">
              Filtered-out WO ids (no lines assigned to this user):
            </div>
            <div className="flex flex-wrap gap-1">
              {filteredOut.slice(0, 12).map((wo) => (
                <span
                  key={wo.id}
                  className="rounded border border-neutral-700 px-2 py-0.5 text-xs"
                >
                  {wo.id.slice(0, 8)}
                  {wo.created_at
                    ? ` • ${new Date(wo.created_at).toLocaleDateString()}`
                    : ""}
                </span>
              ))}
              {filteredOut.length > 12 && (
                <span className="text-xs text-neutral-400">
                  +{filteredOut.length - 12} more…
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* FILTER TILES */}
      <div className="mb-6 grid gap-3 md:grid-cols-4">
        {statuses.map((s) => {
          const isActive = activeFilter === s;
          const url = isActive ? "/queue" : `/queue?status=${s}`;
          return (
            <Link
              key={s}
              href={url}
              className={`rounded p-3 transition ${STATUS_STYLES[s]}`}
              data-active={isActive ? "true" : "false"}
            >
              <div className="text-xs uppercase tracking-wide text-neutral-400">
                {STATUS_LABELS[s]}
              </div>
              <div className="mt-1 text-2xl font-semibold">{counts[s]}</div>
              {isActive && (
                <div className="mt-1 text-[10px] text-orange-200">
                  Showing {STATUS_LABELS[s].toLowerCase()}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* LIST */}
      <div className="space-y-2">
        {filteredWos.map((wo) => {
          const lns = linesByWo.get(wo.id) ?? [];
          const status = rollupStatus(lns);
          const awaiting = lns.filter((l) => (l.status ?? "") === "awaiting").length;
          const inProg = lns.filter((l) => (l.status ?? "") === "in_progress").length;
          const onHold = lns.filter((l) => (l.status ?? "") === "on_hold").length;
          const done = lns.filter((l) => (l.status ?? "") === "completed").length;

          const slug = wo.custom_id ?? wo.id;

          return (
            <Link
              key={wo.id}
              href={`/work-orders/${slug}?mode=tech`}
              className="block rounded border border-neutral-800 bg-neutral-900 p-3 transition hover:border-orange-500"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {wo.custom_id ? wo.custom_id : `#${wo.id.slice(0, 8)}`}
                  </div>
                  {wo.custom_id && (
                    <div className="text-[10px] text-neutral-400">
                      #{wo.id.slice(0, 8)}
                    </div>
                  )}
                  <div className="text-xs text-neutral-400">
                    {awaiting} awaiting · {inProg} in progress · {onHold} on hold ·{" "}
                    {done} completed
                  </div>
                </div>
                <span className="rounded border border-neutral-700 px-2 py-1 text-xs capitalize">
                  {status.replace("_", " ")}
                </span>
              </div>
            </Link>
          );
        })}

        {filteredWos.length === 0 && (
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
            No work orders in this bucket.
          </div>
        )}
      </div>
    </div>
  );
}