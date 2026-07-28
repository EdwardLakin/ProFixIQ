import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { buildWorkforceActivity } from "@/features/workforce/server/buildWorkforceActivity";

type AuditRecord = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
};

type ProfileRecord = {
  id: string;
  user_id: string | null;
  full_name: string | null;
  username: string | null;
  email: string | null;
};

const WORKFORCE_ACTION_MARKERS = [
  "workforce",
  "payroll",
  "staff",
  "schedule",
  "shift",
  "punch",
  "time_off",
  "document",
  "certification",
  "employee",
  "people",
  "user",
];

function displayName(
  profile: ProfileRecord | undefined,
  fallback = "Former employee",
) {
  return (
    profile?.full_name?.trim() ||
    profile?.username?.trim() ||
    profile?.email?.trim() ||
    fallback
  );
}

function metadataProfileId(metadata: Record<string, unknown> | null) {
  if (!metadata) return null;
  for (const key of [
    "person_id",
    "user_id",
    "profile_id",
    "technician_id",
    "target_user_id",
  ]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function categoryFor(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes("payroll")) return "Payroll";
  if (
    normalized.includes("job") ||
    normalized.includes("work_order") ||
    normalized.includes("labor")
  ) {
    return "Operations";
  }
  if (
    normalized.includes("schedule") ||
    normalized.includes("time_off") ||
    normalized.includes("availability")
  ) {
    return "Scheduling";
  }
  if (
    normalized.includes("shift") ||
    normalized.includes("punch") ||
    normalized.includes("attendance")
  ) {
    return "Attendance";
  }
  if (
    normalized.includes("document") ||
    normalized.includes("certification")
  ) {
    return "Compliance";
  }
  return "People";
}

function severityFor(action: string) {
  const normalized = action.toLowerCase();
  return normalized.includes("delete") ||
    normalized.includes("void") ||
    normalized.includes("remove") ||
    normalized.includes("role") ||
    normalized.includes("approve") ||
    normalized.includes("export")
    ? "high"
    : "normal";
}

function actionLabel(action: string) {
  return action
    .split(/[._-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function summaryFor(metadata: Record<string, unknown> | null) {
  if (!metadata) return "Recorded in the workforce activity trail.";
  const details: string[] = [];
  const scheduleDate = metadata.schedule_date;
  const status = metadata.status;
  const reason = metadata.reason;
  const rowCount = metadata.row_count;
  const periodStart = metadata.period_start;
  const periodEnd = metadata.period_end;

  if (typeof scheduleDate === "string") {
    details.push(`Schedule date ${scheduleDate}`);
  }
  if (typeof periodStart === "string" && typeof periodEnd === "string") {
    details.push(`Period ${periodStart} to ${periodEnd}`);
  }
  if (typeof status === "string") {
    details.push(`Status: ${status.replace(/_/g, " ")}`);
  }
  if (typeof rowCount === "number") {
    details.push(`${rowCount} payroll ${rowCount === 1 ? "row" : "rows"}`);
  }
  if (typeof reason === "string" && reason.trim()) {
    details.push(`Reason: ${reason.trim().slice(0, 160)}`);
  }

  return details.length
    ? details.join(" · ")
    : "Recorded in the workforce activity trail.";
}

function genericTarget(category: string) {
  if (category === "Payroll") return "Payroll record";
  if (category === "Scheduling") return "Schedule record";
  if (category === "Attendance") return "Attendance record";
  if (category === "Compliance") return "Requirement record";
  return "Workforce record";
}

export async function GET() {
  const access = await requireShopScopedApiAccess({
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const admin = createAdminSupabase();
  const [
    { data: profiles, error: profileError },
    { data: shop, error: shopError },
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("id, user_id, full_name, username, email")
      .eq("shop_id", access.profile.shop_id),
    admin
      .from("shops")
      .select("timezone")
      .eq("id", access.profile.shop_id)
      .maybeSingle(),
  ]);

  if (profileError || shopError) {
    return NextResponse.json(
      { error: profileError?.message ?? shopError?.message },
      { status: 500 },
    );
  }

  const shopProfiles = (profiles ?? []) as ProfileRecord[];
  const profileIdentityIds = Array.from(
    new Set(
      shopProfiles.flatMap((profile) =>
        [profile.id, profile.user_id].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ),
  );
  const metadataQuery = admin
    .from("audit_logs")
    .select("id, created_at, actor_id, action, target, metadata")
    .contains("metadata", { shop_id: access.profile.shop_id })
    .order("created_at", { ascending: false })
    .limit(300);
  // A current-shop actor can also perform work for another tenant, so actor_id
  // alone is not a safe tenant boundary. Legacy events are recovered only when
  // their target is a globally unique profile identity in this shop.
  const targetQuery =
    profileIdentityIds.length > 0
      ? admin
          .from("audit_logs")
          .select("id, created_at, actor_id, action, target, metadata")
          .in("target", profileIdentityIds)
          .order("created_at", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [], error: null });
  let operationalActivity;
  try {
    const [
      { data: metadataRows, error: metadataError },
      { data: targetRows, error: targetError },
      activity,
    ] = await Promise.all([
      metadataQuery,
      targetQuery,
      buildWorkforceActivity({
        shopId: access.profile.shop_id,
        timezone: shop?.timezone ?? null,
      }),
    ]);

    if (metadataError || targetError) {
      return NextResponse.json(
        {
          error:
            metadataError?.message ??
            targetError?.message ??
            "Unable to load activity",
        },
        { status: 500 },
      );
    }
    operationalActivity = activity;

    const auditById = new Map<string, AuditRecord>();
    for (const row of (metadataRows ?? []) as AuditRecord[]) {
      auditById.set(row.id, row);
    }
    for (const row of (targetRows ?? []) as AuditRecord[]) {
      const metadataShopId = row.metadata?.shop_id;
      if (
        typeof metadataShopId === "string" &&
        metadataShopId !== access.profile.shop_id
      ) {
        continue;
      }
      auditById.set(row.id, row);
    }

    const profileMap = new Map<string, ProfileRecord>();
    for (const profile of shopProfiles) {
      profileMap.set(profile.id, profile);
      if (profile.user_id) profileMap.set(profile.user_id, profile);
    }

    const auditEvents = [...auditById.values()]
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime() ||
          a.id.localeCompare(b.id),
      )
      .filter((row) => {
        const normalized = row.action.toLowerCase();
        return WORKFORCE_ACTION_MARKERS.some((marker) =>
          normalized.includes(marker),
        );
      })
      .map((row) => {
        const category = categoryFor(row.action);
        const metadataTargetId = metadataProfileId(row.metadata);
        const targetProfile =
          (row.target ? profileMap.get(row.target) : undefined) ??
          (metadataTargetId ? profileMap.get(metadataTargetId) : undefined);
        return {
          id: `audit:${row.id}`,
          occurredAt: row.created_at,
          actionKey: row.action,
          actionLabel: actionLabel(row.action),
          category,
          severity: severityFor(row.action),
          actorName: row.actor_id
            ? displayName(profileMap.get(row.actor_id))
            : "System",
          targetLabel: targetProfile
            ? displayName(targetProfile)
            : genericTarget(category),
          summary: summaryFor(row.metadata),
        };
      });

    const operationalEvents = operationalActivity.feed.map((row) => {
      const category = row.workOrderId ? "Operations" : "Attendance";
      const context = [
        row.workOrderNumber ? `Work order ${row.workOrderNumber}` : null,
        row.lineDescription?.trim() || null,
      ].filter((value): value is string => Boolean(value));
      return {
        id: `operational:${row.id}`,
        occurredAt: row.timestamp,
        actionKey: row.action.replaceAll(" ", "_"),
        actionLabel: actionLabel(row.action),
        category,
        severity: "normal",
        actorName: row.employeeName,
        targetLabel:
          context[0] ??
          (category === "Attendance" ? "Daily timecard" : "Workforce record"),
        summary:
          context.length > 0
            ? context.join(" · ")
            : "Recorded from daily punch evidence.",
      };
    });

    const events = [...auditEvents, ...operationalEvents]
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() -
            new Date(a.occurredAt).getTime() ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 150);

    return NextResponse.json({
      events,
      timezone: shop?.timezone ?? "UTC",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load workforce activity",
      },
      { status: 500 },
    );
  }
}
