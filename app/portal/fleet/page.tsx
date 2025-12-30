// app/portal/fleet/page.tsx
"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import Container from "@shared/components/ui/Container";
import FleetPortalDashboard from "@/features/fleet/components/FleetPortalDashboard";
import type {
  DispatchAssignment,
  FleetIssue,
  FleetUnit,
} from "@/features/fleet/components/FleetControlTower";

type DB = Database;

export default function FleetPortalPage() {
  const supabase = createClientComponentClient<DB>();

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

        // 🔹 Load profile + shop
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, first_name, last_name, shop_id, shops(name)")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profileError || !profile?.shop_id) {
          console.error("Unable to resolve fleet portal profile/shop", profileError);
          if (!cancelled) setLoading(false);
          return;
        }

        if (cancelled) return;

        const resolvedFleetName =
          (profile as any).shops?.name ||
          (profile as any).shop_name ||
          "Fleet";

        const resolvedContactName =
          (profile as any).full_name ||
          (profile as any).first_name ||
          (profile as any).last_name ||
          null;

        setFleetName(resolvedFleetName);
        setContactName(resolvedContactName);

        const shopId = profile.shop_id;

        // 🔹 Dispatch assignments for this shop
        const { data: assignmentRows, error: assignmentError } = await supabase
          .from("fleet_dispatch_assignments")
          .select(
            "id, driver_profile_id, driver_name, unit_label, vehicle_identifier, vehicle_id, route_label, next_pretrip_due, state",
          )
          .eq("shop_id", shopId)
          .order("next_pretrip_due", { ascending: true });

        if (assignmentError) {
          console.error("Failed to load fleet assignments", assignmentError);
        }

        const mappedAssignments: DispatchAssignment[] =
          (assignmentRows ?? []).map((row) => {
            const r = row as typeof row & {
              driver_name?: string | null;
              unit_label?: string | null;
              vehicle_identifier?: string | null;
            };

            return {
              id: r.id,
              driverName:
                r.driver_name ||
                resolvedContactName ||
                "Assigned driver",
              driverId: r.driver_profile_id,
              unitLabel:
                r.unit_label ||
                r.vehicle_identifier ||
                `Unit ${r.vehicle_id.slice(0, 8)}`,
              unitId: r.vehicle_id,
              routeLabel: r.route_label,
              nextPreTripDue: r.next_pretrip_due,
              state:
                (r.state as DispatchAssignment["state"]) || "pretrip_due",
            };
          });

        // Derive a simple unit list for header count
        const unitMap = new Map<string, FleetUnit>();
        mappedAssignments.forEach((a) => {
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
        });

        // 🔹 Service requests → issues snapshot
        const { data: requestRows, error: requestError } = await supabase
          .from("fleet_service_requests")
          .select(
            "id, vehicle_id, title, summary, severity, status, created_at",
          )
          .eq("shop_id", shopId)
          .order("created_at", { ascending: false });

        if (requestError) {
          console.error("Failed to load fleet service requests", requestError);
        }

        const mappedIssues: FleetIssue[] = (requestRows ?? []).map((r) => {
          const unitLabel =
            unitMap.get(r.vehicle_id)?.label ||
            `Unit ${r.vehicle_id.slice(0, 8)}`;

          // map cancelled → completed for simpler wording in the portal
          const status =
            r.status === "cancelled"
              ? ("completed" as FleetIssue["status"])
              : (r.status as FleetIssue["status"]);

          return {
            id: r.id,
            unitId: r.vehicle_id,
            unitLabel,
            severity: r.severity as FleetIssue["severity"],
            summary: r.summary,
            createdAt: r.created_at,
            status,
          };
        });

        if (!cancelled) {
          setAssignments(mappedAssignments);
          setIssues(mappedIssues);
          setUnits(Array.from(unitMap.values()));
        }
      } catch (e) {
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
    <main className="relative min-h-[calc(100vh-3rem)] bg-black text-white">
      <Container className="py-6">
        {loading ? (
          <div className="text-sm text-neutral-400">Loading fleet portal…</div>
        ) : (
          <FleetPortalDashboard
            fleetName={fleetName ?? undefined}
            contactName={contactName ?? undefined}
            units={units ?? undefined}
            assignments={assignments ?? undefined}
            issues={issues ?? undefined}
          />
        )}
      </Container>
    </main>
  );
}