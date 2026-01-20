// app/portal/fleet/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import Container from "@shared/components/ui/Container";

import FleetShell from "./FleetShell";
import FleetPortalDashboard from "@/features/fleet/components/FleetPortalDashboard";
import type {
  DispatchAssignment,
  FleetIssue,
  FleetUnit,
} from "@/features/fleet/components/FleetControlTower";

type DB = Database;

// Base Supabase rows
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type FleetDispatchAssignmentRow =
  DB["public"]["Tables"]["fleet_dispatch_assignments"]["Row"];
type FleetServiceRequestRow =
  DB["public"]["Tables"]["fleet_service_requests"]["Row"];

// Profile row with joined shop + optional legacy shop_name
type ProfileWithShop = ProfileRow & {
  shops?: { name: string | null } | null;
  shop_name?: string | null;
};

// Fleet portal visual identity (cool/blue vs customer copper)
const FLEET_ACCENT = "#38BDF8";

const CARD =
  "rounded-2xl border border-white/12 bg-black/25 p-4 backdrop-blur-md " +
  "shadow-card shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]";

function formatUnitFallback(unitId: string): string {
  return unitId.length >= 8 ? `Unit ${unitId.slice(0, 8)}` : "Unit";
}

/**
 * DB allows:
 *  - pretrip_due | en_route | in_shop | completed
 *
 * UI expects ONLY:
 *  - pretrip_due | en_route | in_shop
 *
 * So we normalize DB -> UI here.
 */
function normalizeAssignmentState(
  v: unknown,
): DispatchAssignment["state"] {
  if (v === "pretrip_due" || v === "en_route" || v === "in_shop") return v;

  // DB state "completed" exists, but UI union doesn't include it.
  // Treat completed assignments as "in_shop" for portal display.
  if (v === "completed") return "in_shop";

  return "pretrip_due";
}

function normalizeIssueStatus(v: unknown): FleetIssue["status"] {
  if (v === "open" || v === "scheduled" || v === "completed") return v;
  if (v === "cancelled") return "completed";
  return "open";
}

function normalizeIssueSeverity(v: unknown): FleetIssue["severity"] {
  if (v === "safety" || v === "compliance" || v === "recommend") return v;
  return "recommend";
}

export default function FleetPortalPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [fleetName, setFleetName] = useState<string | null>(null);
  const [contactName, setContactName] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<DispatchAssignment[] | null>(
    null,
  );
  const [issues, setIssues] = useState<FleetIssue[] | null>(null);
  const [units, setUnits] = useState<FleetUnit[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          if (!cancelled) setLoading(false);
          return;
        }

        // Profile + shop
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, shop_id, shop_name, shops(name)")
          .eq("id", session.user.id)
          .maybeSingle<ProfileWithShop>();

        if (profileError || !profile?.shop_id) {
          // eslint-disable-next-line no-console
          console.error("Unable to resolve fleet portal profile/shop", profileError);
          if (!cancelled) setLoading(false);
          return;
        }

        if (cancelled) return;

        const resolvedFleetName =
          profile.shops?.name || profile.shop_name || "Fleet";
        const resolvedContactName = profile.full_name ?? null;

        setFleetName(resolvedFleetName);
        setContactName(resolvedContactName);

        const shopId = profile.shop_id;

        // Dispatch assignments
        const { data: assignmentRows, error: assignmentError } = await supabase
          .from("fleet_dispatch_assignments")
          .select(
            "id, shop_id, driver_profile_id, driver_name, unit_label, vehicle_identifier, vehicle_id, route_label, next_pretrip_due, state",
          )
          .eq("shop_id", shopId)
          .order("next_pretrip_due", { ascending: true })
          .returns<FleetDispatchAssignmentRow[]>();

        if (assignmentError) {
          // eslint-disable-next-line no-console
          console.error("Failed to load fleet assignments", assignmentError);
        }

        const mappedAssignments: DispatchAssignment[] = (assignmentRows ?? []).map(
          (row) => {
            const unitId = row.vehicle_id;
            const fallbackLabel = formatUnitFallback(unitId);

            return {
              id: row.id,
              driverName: row.driver_name || resolvedContactName || "Assigned driver",
              driverId: row.driver_profile_id,
              unitLabel:
                row.unit_label || row.vehicle_identifier || fallbackLabel,
              unitId,
              routeLabel: row.route_label,
              nextPreTripDue: row.next_pretrip_due,
              state: normalizeAssignmentState(row.state),
            };
          },
        );

        // Units derived from assignments (portal view)
        const unitMap = new Map<string, FleetUnit>();
        for (const a of mappedAssignments) {
          if (!unitMap.has(a.unitId)) {
            unitMap.set(a.unitId, {
              id: a.unitId,
              label: a.unitLabel,
              status: "in_service",
              location: null,
              class: null,
              nextInspectionDate: null,
            });
          }
        }

        // Service requests snapshot
        const { data: requestRows, error: requestError } = await supabase
          .from("fleet_service_requests")
          .select("id, shop_id, vehicle_id, summary, severity, status, created_at")
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false })
          .returns<FleetServiceRequestRow[]>();

        if (requestError) {
          // eslint-disable-next-line no-console
          console.error("Failed to load fleet service requests", requestError);
        }

        const mappedIssues: FleetIssue[] = (requestRows ?? []).map((r) => {
          const unitLabel =
            unitMap.get(r.vehicle_id)?.label || formatUnitFallback(r.vehicle_id);

          return {
            id: r.id,
            unitId: r.vehicle_id,
            unitLabel,
            severity: normalizeIssueSeverity(r.severity),
            summary: r.summary ?? "",
            createdAt: r.created_at,
            status: normalizeIssueStatus(r.status),
          };
        });

        if (!cancelled) {
          setAssignments(mappedAssignments);
          setIssues(mappedIssues);
          setUnits(Array.from(unitMap.values()));
        }
      } catch (e: unknown) {
        // eslint-disable-next-line no-console
        console.error("Fleet portal load error", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <FleetShell>
      <main className="relative min-h-[calc(100dvh-52px)] text-white">
        {/* Fleet-themed wash (cool accent, distinct from customer copper) */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.92),#020617_78%)]"
        />

        <Container className="py-6">
          <div className="space-y-5">
            <div className={CARD}>
              <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                Fleet portal
              </div>
              <div
                className="mt-2 text-2xl font-blackops"
                style={{ color: FLEET_ACCENT }}
              >
                {fleetName ?? "Fleet"}
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {contactName ? `Signed in as ${contactName}` : "\u00A0"}
              </div>
            </div>

            {loading ? (
              <div className={CARD + " text-sm text-neutral-400"}>
                Loading fleet portal…
              </div>
            ) : (
              <FleetPortalDashboard
                fleetName={fleetName ?? undefined}
                contactName={contactName ?? undefined}
                units={units ?? undefined}
                assignments={assignments ?? undefined}
                issues={issues ?? undefined}
              />
            )}
          </div>
        </Container>
      </main>
    </FleetShell>
  );
}