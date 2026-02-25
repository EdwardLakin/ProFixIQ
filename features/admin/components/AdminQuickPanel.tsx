"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

// ---- Lite shapes (kept independent from exact DB types) ----
type ActivityLog = {
  id: string;
  event?: string | null;
  actor_id?: string | null;
  created_at?: string | null;
  details?: string | null;
};

type Certification = {
  id: string;
  name?: string | null;
  user_id?: string | null;
  expires_at?: string | null;
};

type Profile = {
  id: string;
  full_name?: string | null;
  role?: string | null;
  created_at?: string | null;
};

type WorkOrder = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  customer_id?: string | null;
  quote_url?: string | null;
};

type WorkOrderLine = {
  id: string;
  work_order_id?: string | null;
  status?: string | null;
  job_type?: string | null;
  assigned_tech_id?: string | null;
  created_at?: string | null;
  hold_reason?: string | null;
  punched_in_at?: string | null;
  punched_out_at?: string | null;
};

type PartsRequest = {
  id: string;
  status?: string | null;
  created_at?: string | null;
  needed_by?: string | null;
  work_order_id?: string | null;
};

type EmailLog = {
  id: string;
  created_at?: string | null;
  recipient?: string | null;
  subject?: string | null;
  error?: string | null;
};

type Shop = {
  id: string;
  name?: string | null;
  active_user_count?: number | null;
  user_limit?: number | null;
  phone_number?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  geo_lat?: number | null;
  geo_lng?: number | null;
  timezone?: string | null;
};

type Vehicle = {
  id: string;
  customer_id?: string | null;
  vin?: string | null;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  created_at?: string | null;
};

type VehiclePhoto = {
  id: string;
  vehicle_id?: string | null;
  created_at?: string | null;
  uploaded_by?: string | null;
  reviewed?: boolean | null;
};

// ---- helpers ----
const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export default function AdminQuickPanel() {
  const supabase = useMemo(() => createClientComponentClient<Database>(), []);

  // state for cards
  const [activity, setActivity] = useState<ActivityLog[] | null>(null);
  const [expiringCerts, setExpiringCerts] = useState<Certification[] | null>(null);
  const [profilesNeedingRole, setProfilesNeedingRole] = useState<Profile[] | null>(null);

  const [openHolds24h, setOpenHolds24h] = useState<WorkOrderLine[] | null>(null);
  const [unassignedJobs, setUnassignedJobs] = useState<WorkOrderLine[] | null>(null);
  const [punchAnomalies, setPunchAnomalies] = useState<WorkOrderLine[] | null>(null);

  const [pendingQuotes, setPendingQuotes] = useState<WorkOrder[] | null>(null);
  const [openPartsRequests] = useState<PartsRequest[] | null>(null);
  const [emailFailures, setEmailFailures] = useState<EmailLog[] | null>(null);

  const [shopUtil, setShopUtil] = useState<Shop | null>(null);
  const [shopMissingFields, setShopMissingFields] = useState<string[] | null>(null);

  const [vehiclesMissingVin, setVehiclesMissingVin] = useState<Vehicle[] | null>(null);
  const [unreviewedPhotos, setUnreviewedPhotos] = useState<VehiclePhoto[] | null>(null);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);

      // Run everything we can in parallel
      const now = new Date();
      const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        activityRes,
        certsRes,
        rolesRes,
        holdsRes,
        unassignedRes,
        punchedRes,
        woRes,
        emailsRes,
        shopRes,
        vehiclesRes,
        photosRes,
      ] = await Promise.allSettled([
        supabase
          .from("activity_logs")
          .select("id,event,actor_id,created_at,details")
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("certifications")
          .select("id,name,user_id,expires_at")
          .gte("expires_at", now.toISOString())
          .lte("expires_at", in30.toISOString())
          .order("expires_at", { ascending: true })
          .limit(5),

        supabase
          .from("profiles")
          .select("id,full_name,role,created_at")
          .is("role", null)
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("work_order_lines")
          .select("id,work_order_id,status,hold_reason,created_at")
          .eq("status", "on_hold")
          .gte("created_at", last7.toISOString())
          .order("created_at", { ascending: false })
          .limit(20),

        supabase
          .from("work_order_lines")
          .select("id,work_order_id,status,job_type,assigned_tech_id,created_at")
          .in("status", ["awaiting", "in_progress"])
          .is("assigned_tech_id", null)
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("work_order_lines")
          .select("id,work_order_id,status,job_type,created_at,punched_in_at,punched_out_at")
          .not("punched_in_at", "is", null)
          .is("punched_out_at", null)
          .order("punched_in_at", { ascending: false })
          .limit(25),

        supabase
          .from("work_orders")
          .select("id,status,created_at,quote_url")
          .is("quote_url", null)
          .order("created_at", { ascending: false })
          .limit(15),

        supabase
          .from("parts_requests")
          .select("id,status,created_at,needed_by,work_order_id")
          .neq("status", "fulfilled")
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("email_logs")
          .select("id,created_at,recipient,subject,error")
          .not("error", "is", null)
          .order("created_at", { ascending: false })
          .limit(10),

        supabase
          .from("shops")
          .select(
            "id,name,active_user_count,user_limit,phone_number,email,address,city,province,postal_code,geo_lat,geo_lng,timezone"
          )
          .limit(1)
          .single(),

        supabase
          .from("vehicles")
          .select("id,customer_id,vin,year,make,model,created_at")
          .is("vin", null)
          .order("created_at", { ascending: false })
          .limit(5),

        supabase
          .from("vehicle_photos")
          .select("id,vehicle_id,created_at,uploaded_by,reviewed")
          .or("reviewed.is.null,reviewed.eq.false")
          .order("created_at", { ascending: false })
          .limit(6),
      ]);

      if (cancelled) return;

      const get = <T,>(r: PromiseSettledResult<{ data: any }>) =>
        r.status === "fulfilled" ? ((r.value.data as unknown as T[]) ?? []) : [];

      // Simple lists
      setActivity(get<ActivityLog>(activityRes));
      setExpiringCerts(get<Certification>(certsRes));
      setProfilesNeedingRole(get<Profile>(rolesRes));
      setUnassignedJobs(get<WorkOrderLine>(unassignedRes));
      setEmailFailures(get<EmailLog>(emailsRes));
      setVehiclesMissingVin(get<Vehicle>(vehiclesRes));
      setUnreviewedPhotos(get<VehiclePhoto>(photosRes));

      // Holds > 24h
      const holds = get<WorkOrderLine>(holdsRes);
      const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
      setOpenHolds24h(
        holds.filter((j) => j.created_at && new Date(j.created_at).getTime() < dayAgoMs)
      );

      // Punch anomalies > 8h
      const punched = get<WorkOrderLine>(punchedRes);
      const eightHours = 8 * 60 * 60 * 1000;
      setPunchAnomalies(
        punched.filter((j) => {
          const pi = j.punched_in_at ? new Date(j.punched_in_at).getTime() : 0;
          return pi && Date.now() - pi > eightHours;
        })
      );

      // Shop utilization + missing pieces
      if (shopRes.status === "fulfilled" && shopRes.value.data) {
        const s = (shopRes.value.data as unknown as Shop) ?? null;
        setShopUtil(s);
        if (s) {
          const missing: string[] = [];
          if (!s.phone_number) missing.push("phone");
          if (!s.email) missing.push("email");
          if (!s.address || !s.city || !s.province || !s.postal_code) missing.push("address");
          if (s.geo_lat == null || s.geo_lng == null) missing.push("map coords");
          if (!s.timezone) missing.push("timezone");
          setShopMissingFields(missing.length ? missing : null);
        } else {
          setShopMissingFields(null);
        }
      } else {
        setShopUtil(null);
        setShopMissingFields(null);
      }

      // Pending quotes = WOs with no quote_url AND at least one tech-suggested job
      const candidateWOs = get<WorkOrder>(woRes);
      const withSuggestions: WorkOrder[] = [];
      for (const w of candidateWOs) {
        // Stop once we have 5 to keep it light
        if (withSuggestions.length >= 5) break;
        const { data: lines } = await supabase
          .from("work_order_lines")
          .select("id")
          .eq("work_order_id", w.id)
          .eq("job_type", "tech-suggested")
          .limit(1);
        if ((lines as any[])?.length) withSuggestions.push(w);
      }
      setPendingQuotes(withSuggestions);

      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  // ---- skeleton ----
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 animate-pulse"
          >
            <div className="h-5 w-40 bg-neutral-800 rounded mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-full bg-neutral-800 rounded" />
              <div className="h-4 w-5/6 bg-neutral-800 rounded" />
              <div className="h-4 w-4/6 bg-neutral-800 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const cards: JSX.Element[] = [];

  // Recent activity
  if (activity?.length) {
    cards.push(
      <div key="activity" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Recent Activity</h3>
          <Link href="/dashboard/admin/audit" className="text-xs text-orange-400 underline">
            View all
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {activity.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-orange-500" />
              <div>
                <div className="text-white">{a.event ?? "Activity"}</div>
                <div className="text-xs text-neutral-400">{fmtDate(a.created_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Cert expirations
  if (expiringCerts?.length) {
    cards.push(
      <div key="certs" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">
            Certifications Expiring (30 days)
          </h3>
          <Link href="/dashboard/admin/certifications" className="text-xs text-orange-400 underline">
            Manage
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {expiringCerts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <div className="text-white">{c.name ?? "Certification"}</div>
              <div className="text-xs text-red-400">{fmtDate(c.expires_at)}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Users needing role
  if (profilesNeedingRole?.length) {
    cards.push(
      <div key="roles" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Users Need Role Assignment</h3>
          <Link href="/dashboard/admin/roles" className="text-xs text-orange-400 underline">
            Assign
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {profilesNeedingRole.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2">
              <div className="text-white">{p.full_name || p.id.slice(0, 8)}</div>
              <div className="text-xs text-neutral-400">{fmtDate(p.created_at)}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // On-hold > 24h
  if (openHolds24h?.length) {
    cards.push(
      <div key="holds" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Jobs on Hold &gt; 24h</h3>
          <Link href="/work-orders/queue" className="text-xs text-orange-400 underline">
            Queue
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {openHolds24h.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2">
              <span className="text-white">#{j.work_order_id?.slice(0, 8) ?? "—"}</span>
              <span className="text-xs text-neutral-400">{j.hold_reason || "On hold"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Unassigned jobs
  if (unassignedJobs?.length) {
    cards.push(
      <div key="unassigned" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Unassigned Jobs</h3>
          <Link href="/dashboard/manager" className="text-xs text-orange-400 underline">
            Assign
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {unassignedJobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2">
              <span className="text-white">#{j.work_order_id?.slice(0, 8) ?? "—"}</span>
              <span className="text-xs text-neutral-400">{j.job_type || "job"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Punch anomalies > 8h
  if (punchAnomalies?.length) {
    cards.push(
      <div key="punch" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Punched In &gt; 8h (Check)</h3>
          <Link href="/tech/queue" className="text-xs text-orange-400 underline">
            View
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {punchAnomalies.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-2">
              <span className="text-white">#{j.work_order_id?.slice(0, 8) ?? "—"}</span>
              <span className="text-xs text-neutral-400">{j.job_type || "job"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Pending quotes
  if (pendingQuotes?.length) {
    cards.push(
      <div key="quotes" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Quotes To Generate</h3>
          <Link href="/work-orders/queue" className="text-xs text-orange-400 underline">
            Queue
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {pendingQuotes.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-2">
              <span className="text-white">WO #{w.id.slice(0, 8)}</span>
              <span className="text-xs text-neutral-400">{fmtDate(w.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Parts requests
  if (openPartsRequests?.length) {
    cards.push(
      <div key="parts" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Open Parts Requests</h3>
          <Link href="/parts" className="text-xs text-orange-400 underline">
            Parts
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {openPartsRequests.map((pr) => (
            <li key={pr.id} className="flex items-center justify-between gap-2">
              <span className="text-white">WO #{pr.work_order_id?.slice(0, 8) ?? "—"}</span>
              <span className="text-xs text-neutral-400">{pr.status || "open"}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Email failures
  if (emailFailures?.length) {
    cards.push(
      <div key="email" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Email Delivery Issues</h3>
          <Link href="/dashboard/admin/audit" className="text-xs text-orange-400 underline">
            Logs
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {emailFailures.slice(0, 5).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span className="text-white">{e.recipient || "recipient"}</span>
              <span className="text-xs text-red-400">{fmtDate(e.created_at)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Shop utilization + setup completeness
  if (shopUtil) {
    const used = shopUtil.active_user_count ?? 0;
    const cap = shopUtil.user_limit ?? 0;
    const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;

    cards.push(
      <div key="shop" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">
            {shopUtil.name || "Shop"} Utilization
          </h3>
        </div>
        <div className="text-sm">
          Users {used}/{cap || "—"} {cap ? `(${pct}%)` : ""}
        </div>
        {shopMissingFields?.length ? (
          <div className="mt-2 text-xs text-yellow-400">
            Missing: {shopMissingFields.join(", ")}
          </div>
        ) : null}
        <div className="mt-2">
          <Link href="/dashboard/owner/settings" className="text-xs text-orange-400 underline">
            Settings
          </Link>
        </div>
      </div>
    );
  }

  // Vehicles missing VIN
  if (vehiclesMissingVin?.length) {
    cards.push(
      <div key="vin" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Vehicles Missing VIN</h3>
          <Link href="/portal/vehicles" className="text-xs text-orange-400 underline">
            Fix
          </Link>
        </div>
        <ul className="space-y-2 text-sm">
          {vehiclesMissingVin.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2">
              <span className="text-white">
                {[v.year, v.make, v.model].filter(Boolean).join(" ") || v.id.slice(0, 8)}
              </span>
              <span className="text-xs text-neutral-400">No VIN</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Unreviewed vehicle photos
  if (unreviewedPhotos?.length) {
    cards.push(
      <div key="photos" className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Unreviewed Vehicle Photos</h3>
          <Link href="/parts" className="text-xs text-orange-400 underline">
            Gallery
          </Link>
        </div>
        <div className="text-sm text-neutral-300">
          {unreviewedPhotos.length} photo{unreviewedPhotos.length === 1 ? "" : "s"} need review
        </div>
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
        Nothing to review right now.
      </div>
    );
  }

  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{cards}</div>;
}